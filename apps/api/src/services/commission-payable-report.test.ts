import { afterAll, describe, expect, it } from "vitest";
import { signAccessToken } from "../auth/jwt.js";
import { hashPassword } from "../auth/password.js";
import { prisma } from "../db.js";
import { buildApp } from "../app.js";
import { ensureDefaultOrderSituations } from "./order-situations.js";
import {
  createOrgProfile,
  upsertProfilePermission,
} from "./org-profiles.js";
import { ensureOrgRolePermissions } from "./role-permissions.js";
import {
  buildCommissionPayableReport,
  saoPauloMonthBounds,
  setCommissionPayableCriterion,
  settlementDateFromPayments,
  syncCommissionPayableLedger,
} from "./commission-payable-report.js";

const hasDb = Boolean(
  process.env.DATABASE_URL?.trim() && process.env.JWT_SECRET?.trim(),
);

const sep = saoPauloMonthBounds(2026, 9);
const aug = saoPauloMonthBounds(2026, 8);
const oct = saoPauloMonthBounds(2026, 10);

function iso(d: Date) {
  return d.toISOString();
}

describe("settlementDateFromPayments", () => {
  it("só considera a comissão na data do último pagamento que completa o total", () => {
    const at = settlementDateFromPayments(1000, [
      { amount: 500, at: new Date("2026-09-10T15:00:00.000Z") },
      { amount: 500, at: new Date("2026-10-08T15:00:00.000Z") },
    ]);
    expect(at?.toISOString()).toBe("2026-10-08T15:00:00.000Z");
  });

  it("não rateia pagamento parcial", () => {
    expect(
      settlementDateFromPayments(1000, [
        { amount: 500, at: new Date("2026-09-10T15:00:00.000Z") },
      ]),
    ).toBeNull();
  });
});

describe.skipIf(!hasDb)("relatório comissões a pagar", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orgIds: string[] = [];
  let app: Awaited<ReturnType<typeof buildApp>>;
  const passwordHashP = hashPassword("cpp-test");

  afterAll(async () => {
    if (orgIds.length) {
      await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    if (app) await app.close();
  });

  async function createWorld(opts?: {
    criterion?: "EMITTED" | "INVOICED" | "SETTLED";
    sellerName?: string;
  }) {
    const passwordHash = await passwordHashP;
    const org = await prisma.organization.create({
      data: {
        name: `CPP ${stamp} ${Math.random().toString(36).slice(2, 6)}`,
        displayName: "CPP Teste",
        accessStatus: "ACTIVE",
        commissionPayableCriterion: opts?.criterion ?? "EMITTED",
        establishments: {
          create: {
            legalName: "CPP Est",
            isPrimary: true,
            active: true,
          },
        },
      },
      include: { establishments: true },
    });
    orgIds.push(org.id);
    await ensureDefaultOrderSituations(org.id);
    await ensureOrgRolePermissions(org.id);

    const openSit = await prisma.orderSituation.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: org.id, code: "OPEN" } },
    });
    const cancelSit = await prisma.orderSituation.findUniqueOrThrow({
      where: {
        organizationId_code: { organizationId: org.id, code: "CANCELLED" },
      },
    });
    const establishmentId = org.establishments[0]!.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${org.id.slice(-6)}@cpp.test`,
        passwordHash,
        name: "Admin CPP",
        role: "ADMIN",
        organizationId: org.id,
        activatedAt: new Date(),
      },
    });
    const manager = await prisma.user.create({
      data: {
        email: `manager-${org.id.slice(-6)}@cpp.test`,
        passwordHash,
        name: "Gestor CPP",
        role: "MANAGER",
        organizationId: org.id,
        activatedAt: new Date(),
      },
    });
    const sellerUser = await prisma.user.create({
      data: {
        email: `seller-${org.id.slice(-6)}@cpp.test`,
        passwordHash,
        name: opts?.sellerName ?? "João",
        role: "SELLER",
        organizationId: org.id,
        activatedAt: new Date(),
        seller: {
          create: {
            organizationId: org.id,
            commissionType: "FIXED",
            commissionPercent: 10,
            active: true,
          },
        },
      },
      include: { seller: true },
    });
    const customer = await prisma.customer.create({
      data: { name: "Cliente CPP", organizationId: org.id },
    });
    const product = await prisma.product.create({
      data: {
        name: "Produto CPP",
        organizationId: org.id,
        basePrice: 100,
      },
    });

    async function addSeller(name: string) {
      const u = await prisma.user.create({
        data: {
          email: `seller-${name}-${org.id.slice(-6)}@cpp.test`.toLowerCase(),
          passwordHash,
          name,
          role: "SELLER",
          organizationId: org.id,
          activatedAt: new Date(),
          seller: {
            create: {
              organizationId: org.id,
              commissionType: "FIXED",
              commissionPercent: 10,
              active: true,
            },
          },
        },
        include: { seller: true },
      });
      return u.seller!;
    }

    async function createOrder(input: {
      sellerId: string;
      total: number;
      commission: number;
      createdAt: Date;
      status?: "CONFIRMED" | "CANCELLED";
      invoicedAt?: Date;
      receipts?: Array<{ amount: number; receivedAt: Date }>;
      priceTableName?: string;
    }) {
      const status = input.status ?? "CONFIRMED";
      const order = await prisma.order.create({
        data: {
          organizationId: org.id,
          establishmentId,
          sellerId: input.sellerId,
          customerId: customer.id,
          situationId: status === "CANCELLED" ? cancelSit.id : openSit.id,
          status,
          totalAmount: input.total,
          createdAt: input.createdAt,
          items: {
            create: [
              {
                productId: product.id,
                productName: "Produto CPP",
                quantity: 1,
                unitPrice: input.total,
                commissionPercent:
                  input.total > 0
                    ? Math.round((input.commission / input.total) * 10000) / 100
                    : 0,
                commissionAmount: input.commission,
                priceTableName: input.priceTableName ?? "Tabela padrão",
              },
            ],
          },
        },
      });
      if (input.invoicedAt) {
        await prisma.fiscalInvoice.create({
          data: {
            organizationId: org.id,
            establishmentId,
            direction: "OUTBOUND",
            status: "AUTHORIZED",
            totalAmount: input.total,
            issuedAt: input.invoicedAt,
            orderId: order.id,
          },
        });
      }
      for (const r of input.receipts ?? []) {
        await prisma.orderReceipt.create({
          data: {
            organizationId: org.id,
            orderId: order.id,
            amount: r.amount,
            receivedAt: r.receivedAt,
          },
        });
      }
      return order;
    }

    return {
      orgId: org.id,
      sellerId: sellerUser.seller!.id,
      managerId: manager.id,
      adminToken: signAccessToken({
        sub: admin.id,
        role: "ADMIN",
        organizationId: org.id,
        sellerId: null,
      }),
      managerToken: signAccessToken({
        sub: manager.id,
        role: "MANAGER",
        organizationId: org.id,
        sellerId: null,
      }),
      createOrder,
      addSeller,
    };
  }

  it("1. EMITIDOS: emitido em 10/09 R$100 entra em setembro", async () => {
    const w = await createWorld({ criterion: "EMITTED" });
    await w.createOrder({
      sellerId: w.sellerId,
      total: 1000,
      commission: 100,
      createdAt: new Date("2026-09-10T15:00:00.000Z"),
    });
    const report = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(sep.start),
      to: iso(sep.end),
    });
    expect(report.totals.commissionAmount).toBe(100);
    expect(report.sellers[0]?.sellerName).toBe("João");
  });

  it("2. FATURADOS: emitido 30/08 faturado 02/09 → agosto 0, setembro 100", async () => {
    const w = await createWorld({ criterion: "INVOICED" });
    await w.createOrder({
      sellerId: w.sellerId,
      total: 1000,
      commission: 100,
      createdAt: new Date("2026-08-30T15:00:00.000Z"),
      invoicedAt: new Date("2026-09-02T15:00:00.000Z"),
    });
    const august = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(aug.start),
      to: iso(aug.end),
    });
    const september = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(sep.start),
      to: iso(sep.end),
    });
    expect(august.totals.commissionAmount).toBe(0);
    expect(september.totals.commissionAmount).toBe(100);
  });

  it("3. LIQUIDADOS: 500 em set + 500 em out → comissão 100 só em outubro", async () => {
    const w = await createWorld({ criterion: "SETTLED" });
    await w.createOrder({
      sellerId: w.sellerId,
      total: 1000,
      commission: 100,
      createdAt: new Date("2026-09-01T15:00:00.000Z"),
      receipts: [
        { amount: 500, receivedAt: new Date("2026-09-15T15:00:00.000Z") },
        { amount: 500, receivedAt: new Date("2026-10-10T15:00:00.000Z") },
      ],
    });
    const september = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(sep.start),
      to: iso(sep.end),
    });
    const october = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(oct.start),
      to: iso(oct.end),
    });
    expect(september.totals.commissionAmount).toBe(0);
    expect(october.totals.commissionAmount).toBe(100);
  });

  it("4. FATURADOS: emitido e não faturado → 0", async () => {
    const w = await createWorld({ criterion: "INVOICED" });
    await w.createOrder({
      sellerId: w.sellerId,
      total: 150,
      commission: 15,
      createdAt: new Date("2026-09-05T15:00:00.000Z"),
    });
    const report = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(sep.start),
      to: iso(sep.end),
    });
    expect(report.totals.commissionAmount).toBe(0);
    expect(report.sellers).toHaveLength(0);
  });

  it("5. cancelado antes do critério não entra", async () => {
    const w = await createWorld({ criterion: "EMITTED" });
    await w.createOrder({
      sellerId: w.sellerId,
      total: 400,
      commission: 40,
      createdAt: new Date("2026-09-08T15:00:00.000Z"),
      status: "CANCELLED",
    });
    const report = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(sep.start),
      to: iso(sep.end),
    });
    expect(report.totals.commissionAmount).toBe(0);
  });

  it("6. João + Pedro + Carlos aparecem e o total soma 3500", async () => {
    const w = await createWorld({ criterion: "EMITTED", sellerName: "João" });
    const pedro = await w.addSeller("Pedro");
    const carlos = await w.addSeller("Carlos");
    const day = new Date("2026-09-12T15:00:00.000Z");
    await w.createOrder({
      sellerId: w.sellerId,
      total: 10000,
      commission: 1000,
      createdAt: day,
    });
    await w.createOrder({
      sellerId: pedro.id,
      total: 20000,
      commission: 2000,
      createdAt: day,
    });
    await w.createOrder({
      sellerId: carlos.id,
      total: 5000,
      commission: 500,
      createdAt: day,
    });
    const report = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(sep.start),
      to: iso(sep.end),
    });
    expect(report.sellers.map((s) => s.sellerName)).toEqual([
      "Carlos",
      "João",
      "Pedro",
    ]);
    expect(report.sellers.find((s) => s.sellerName === "João")?.commissionAmount).toBe(
      1000,
    );
    expect(report.sellers.find((s) => s.sellerName === "Pedro")?.commissionAmount).toBe(
      2000,
    );
    expect(
      report.sellers.find((s) => s.sellerName === "Carlos")?.commissionAmount,
    ).toBe(500);
    expect(report.totals.commissionAmount).toBe(3500);
  });

  it("não duplica ao trocar o critério depois de considerado", async () => {
    const w = await createWorld({ criterion: "EMITTED" });
    await w.createOrder({
      sellerId: w.sellerId,
      total: 1000,
      commission: 100,
      createdAt: new Date("2026-08-28T15:00:00.000Z"),
      invoicedAt: new Date("2026-09-03T15:00:00.000Z"),
    });
    await syncCommissionPayableLedger(w.orgId, "EMITTED");
    await setCommissionPayableCriterion(w.orgId, "INVOICED");
    const september = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(sep.start),
      to: iso(sep.end),
    });
    const august = await buildCommissionPayableReport({
      organizationId: w.orgId,
      from: iso(aug.start),
      to: iso(aug.end),
    });
    expect(august.totals.commissionAmount).toBe(100);
    expect(september.totals.commissionAmount).toBe(0);
  });

  it("7. usuário sem permissão é negado na API", async () => {
    app = app ?? (await buildApp());
    const w = await createWorld();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/reports/commissions-payable?from=${iso(sep.start)}&to=${iso(sep.end)}`,
      headers: { authorization: `Bearer ${w.managerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("8. usuário com permissão concedida é autorizado", async () => {
    app = app ?? (await buildApp());
    const w = await createWorld();
    const profile = await createOrgProfile(w.orgId, { name: "Financeiro" });
    await upsertProfilePermission(
      profile.id,
      "reports_commissions_payable",
      "read",
    );
    await prisma.user.update({
      where: { id: w.managerId },
      data: { organizationProfileId: profile.id },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/reports/commissions-payable?from=${iso(sep.start)}&to=${iso(sep.end)}`,
      headers: { authorization: `Bearer ${w.managerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { totals: { commissionAmount: number } };
    expect(body.totals.commissionAmount).toBe(0);
  });
});
