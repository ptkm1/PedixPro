/**
 * Cenários Nova Venda ADM/Gestor + Venda Direta.
 * Pedido explícito do usuário: testes principais (vende regra workspace de não criar testes).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signAccessToken } from "../auth/jwt.js";
import { hashPassword } from "../auth/password.js";
import { prisma } from "../db.js";
import { buildApp } from "../app.js";
import { ORDER_SELLER_FILTER_DIRECT } from "@pedidos/shared";

const hasDb = Boolean(
  process.env.DATABASE_URL?.trim() && process.env.JWT_SECRET?.trim(),
);

describe.skipIf(!hasDb)("Nova Venda ADM/Gestor + Venda Direta", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let orgId: string;
  let adminToken: string;
  let managerToken: string;
  let sellerToken: string;
  let adminUserId: string;
  let managerUserId: string;
  let sellerUserId: string;
  let sellerId: string;
  let customerId: string;
  let productId: string;
  let payId: string;

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await hashPassword("nova-venda-test");

    const org = await prisma.organization.create({
      data: {
        name: `NovaVenda ${stamp}`,
        displayName: `NovaVenda ${stamp}`,
        accessStatus: "ACTIVE",
        establishments: {
          create: {
            legalName: `NovaVenda ${stamp}`,
            isPrimary: true,
            active: true,
            cnpj: null,
          },
        },
      },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        email: `nv-admin-${stamp}@iso.test`,
        passwordHash,
        name: "Admin NV",
        role: "ADMIN",
        organizationId: orgId,
        activatedAt: new Date(),
      },
    });
    adminUserId = admin.id;

    const manager = await prisma.user.create({
      data: {
        email: `nv-mgr-${stamp}@iso.test`,
        passwordHash,
        name: "Gestor NV",
        role: "MANAGER",
        organizationId: orgId,
        activatedAt: new Date(),
      },
    });
    managerUserId = manager.id;

    const sellerUser = await prisma.user.create({
      data: {
        email: `nv-seller-${stamp}@iso.test`,
        passwordHash,
        name: "Vendedor NV",
        role: "SELLER",
        organizationId: orgId,
        activatedAt: new Date(),
        seller: {
          create: {
            organizationId: orgId,
            commissionType: "FIXED",
            commissionPercent: 10,
            active: true,
            managerUserId: manager.id,
          },
        },
      },
      include: { seller: true },
    });
    sellerUserId = sellerUser.id;
    sellerId = sellerUser.seller!.id;

    const product = await prisma.product.create({
      data: {
        organizationId: orgId,
        name: `Produto NV ${stamp}`,
        sku: `NV-${stamp.slice(-6)}`,
        basePrice: 100,
        stockQty: 1000,
      },
    });
    productId = product.id;

    await prisma.sellerProduct.create({
      data: { sellerId, productId },
    });

    const customer = await prisma.customer.create({
      data: {
        organizationId: orgId,
        name: `Cliente NV ${stamp}`,
        approvalStatus: "APPROVED",
        status: "ACTIVE",
        sellerId,
      },
    });
    customerId = customer.id;

    const pay = await prisma.paymentCondition.create({
      data: {
        organizationId: orgId,
        code: "1",
        name: "À vista",
        days: 0,
        active: true,
        sortOrder: 0,
      },
    });
    payId = pay.id;

    adminToken = signAccessToken({
      sub: adminUserId,
      role: "ADMIN",
      organizationId: orgId,
      sellerId: null,
    });
    managerToken = signAccessToken({
      sub: managerUserId,
      role: "MANAGER",
      organizationId: orgId,
      sellerId: null,
    });
    sellerToken = signAccessToken({
      sub: sellerUserId,
      role: "SELLER",
      organizationId: orgId,
      sellerId,
    });
  }, 60_000);

  afterAll(async () => {
    if (orgId) {
      await prisma.order.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    if (app) await app.close();
  });

  function postAdminOrder(token: string, payload: unknown) {
    return app.inject({
      method: "POST",
      url: "/api/v1/admin/orders",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload,
    });
  }

  function postSellerSale(token: string, payload: unknown) {
    return app.inject({
      method: "POST",
      url: "/api/v1/seller/sales",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload,
    });
  }

  function sumCommission(items: Array<{ commissionAmount?: unknown }>) {
    return items.reduce((acc, i) => acc + Number(i.commissionAmount ?? 0), 0);
  }

  it("vendedor: seller = ele mesmo; não aceita sellerId alheio nem venda direta", async () => {
    const res = await postSellerSale(sellerToken, {
      sellerId: null,
      customerId,
      paymentConditionId: payId,
      status: "DRAFT",
      items: [{ productId, quantity: 1 }],
    });
    expect(res.statusCode).toBe(200);
    const order = JSON.parse(res.body) as {
      sellerId: string;
      createdByUserId: string;
      items: Array<{ commissionAmount: unknown }>;
    };
    expect(order.sellerId).toBe(sellerId);
    expect(order.createdByUserId).toBe(sellerUserId);
    expect(sumCommission(order.items)).toBeGreaterThan(0);
  });

  it("ADM + vendedor: associa seller, comissão > 0, createdBy = admin", async () => {
    const res = await postAdminOrder(adminToken, {
      sellerId,
      customerId,
      paymentConditionId: payId,
      status: "DRAFT",
      items: [{ productId, quantity: 1 }],
    });
    expect(res.statusCode).toBe(200);
    const order = JSON.parse(res.body) as {
      sellerId: string | null;
      createdByUserId: string;
      items: Array<{ commissionAmount: unknown; commissionPercent: unknown }>;
    };
    expect(order.sellerId).toBe(sellerId);
    expect(order.createdByUserId).toBe(adminUserId);
    expect(sumCommission(order.items)).toBe(10);
  });

  it("ADM venda direta: sellerId null, comissão 0, label via filtro", async () => {
    const res = await postAdminOrder(adminToken, {
      sellerId: null,
      customerId,
      paymentConditionId: payId,
      status: "DRAFT",
      items: [{ productId, quantity: 2 }],
    });
    expect(res.statusCode).toBe(200);
    const order = JSON.parse(res.body) as {
      id: string;
      sellerId: string | null;
      seller: unknown;
      createdByUserId: string;
      totalAmount: unknown;
      items: Array<{ commissionAmount: unknown; commissionPercent: unknown }>;
    };
    expect(order.sellerId).toBeNull();
    expect(order.seller).toBeNull();
    expect(order.createdByUserId).toBe(adminUserId);
    expect(sumCommission(order.items)).toBe(0);
    expect(Number(order.items[0]?.commissionPercent ?? -1)).toBe(0);
    expect(Number(order.totalAmount)).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/admin/orders?sellerId=${ORDER_SELLER_FILTER_DIRECT}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(list.statusCode).toBe(200);
    const rows = JSON.parse(list.body) as Array<{ id: string; sellerId: string | null }>;
    expect(rows.some((r) => r.id === order.id && r.sellerId === null)).toBe(
      true,
    );
  });

  it("Gestor + vendedor (escopo): associa seller gerido", async () => {
    const res = await postAdminOrder(managerToken, {
      sellerId,
      customerId,
      paymentConditionId: payId,
      status: "DRAFT",
      items: [{ productId, quantity: 1 }],
    });
    expect(res.statusCode).toBe(200);
    const order = JSON.parse(res.body) as {
      sellerId: string | null;
      createdByUserId: string;
    };
    expect(order.sellerId).toBe(sellerId);
    expect(order.createdByUserId).toBe(managerUserId);
  });

  it("Gestor venda direta via app /seller/sales", async () => {
    const res = await postSellerSale(managerToken, {
      sellerId: null,
      customerId,
      paymentConditionId: payId,
      status: "DRAFT",
      items: [{ productId, quantity: 1 }],
    });
    expect(res.statusCode).toBe(200);
    const order = JSON.parse(res.body) as {
      sellerId: string | null;
      createdByUserId: string;
      items: Array<{ commissionAmount: unknown }>;
    };
    expect(order.sellerId).toBeNull();
    expect(order.createdByUserId).toBe(managerUserId);
    expect(sumCommission(order.items)).toBe(0);
  });

  it("troca direta ↔ vendedor recalcula comissão sem duplicar", async () => {
    const create = await postAdminOrder(adminToken, {
      sellerId: null,
      customerId,
      paymentConditionId: payId,
      status: "DRAFT",
      items: [{ productId, quantity: 1 }],
    });
    expect(create.statusCode).toBe(200);
    const created = JSON.parse(create.body) as {
      id: string;
      sellerId: string | null;
      items: Array<{ id: string; commissionAmount: unknown }>;
    };
    expect(created.sellerId).toBeNull();
    expect(sumCommission(created.items)).toBe(0);

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${created.id}/seller`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { sellerId },
    });
    expect(patch.statusCode).toBe(200);
    const assigned = JSON.parse(patch.body) as {
      id: string;
      sellerId: string | null;
      items: Array<{ commissionAmount: unknown }>;
    };
    expect(assigned.id).toBe(created.id);
    expect(assigned.sellerId).toBe(sellerId);
    expect(sumCommission(assigned.items)).toBe(10);

    const patchBack = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${created.id}/seller`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { sellerId: null },
    });
    expect(patchBack.statusCode).toBe(200);
    const direct = JSON.parse(patchBack.body) as {
      sellerId: string | null;
      items: Array<{ commissionAmount: unknown }>;
    };
    expect(direct.sellerId).toBeNull();
    expect(sumCommission(direct.items)).toBe(0);

    const count = await prisma.order.count({
      where: { organizationId: orgId, id: created.id },
    });
    expect(count).toBe(1);
  });

  it("cancelamento de venda direta não quebra e remove da lista confirmada", async () => {
    const create = await postAdminOrder(adminToken, {
      sellerId: null,
      customerId,
      paymentConditionId: payId,
      status: "CONFIRMED",
      items: [{ productId, quantity: 1 }],
    });
    expect(create.statusCode).toBe(200);
    const order = JSON.parse(create.body) as { id: string; status: string };
    expect(order.status).toBe("CONFIRMED");

    const cancel = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.id}/status`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: { status: "CANCELLED" },
    });
    expect(cancel.statusCode).toBe(200);
    const cancelled = JSON.parse(cancel.body) as { status: string };
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("relatórios: filtro Todos inclui diretas; filtro direta só null; comissão individual só com seller", async () => {
    await postAdminOrder(adminToken, {
      sellerId,
      customerId,
      paymentConditionId: payId,
      status: "CONFIRMED",
      items: [{ productId, quantity: 1 }],
    });
    await postAdminOrder(adminToken, {
      sellerId: null,
      customerId,
      paymentConditionId: payId,
      status: "CONFIRMED",
      items: [{ productId, quantity: 1 }],
    });

    const all = await app.inject({
      method: "GET",
      url: "/api/v1/admin/orders",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(all.statusCode).toBe(200);
    const allRows = JSON.parse(all.body) as Array<{
      sellerId: string | null;
      status: string;
    }>;
    const confirmed = allRows.filter((r) => r.status === "CONFIRMED");
    expect(confirmed.some((r) => r.sellerId === null)).toBe(true);
    expect(confirmed.some((r) => r.sellerId === sellerId)).toBe(true);

    const onlyDirect = await app.inject({
      method: "GET",
      url: `/api/v1/admin/orders?sellerId=${ORDER_SELLER_FILTER_DIRECT}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const directRows = JSON.parse(onlyDirect.body) as Array<{
      sellerId: string | null;
    }>;
    expect(directRows.length).toBeGreaterThan(0);
    expect(directRows.every((r) => r.sellerId === null)).toBe(true);

    const onlySeller = await app.inject({
      method: "GET",
      url: `/api/v1/admin/orders?sellerId=${sellerId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const sellerRows = JSON.parse(onlySeller.body) as Array<{
      sellerId: string | null;
    }>;
    expect(sellerRows.every((r) => r.sellerId === sellerId)).toBe(true);
  });
});
