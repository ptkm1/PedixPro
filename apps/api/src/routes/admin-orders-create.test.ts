import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signAccessToken } from "../auth/jwt.js";
import { hashPassword } from "../auth/password.js";
import { prisma } from "../db.js";
import { buildApp } from "../app.js";

const hasDb = Boolean(
  process.env.DATABASE_URL?.trim() && process.env.JWT_SECRET?.trim(),
);

describe.skipIf(!hasDb)("POST /admin/orders", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let orgA: string;
  let orgB: string;
  let adminTokenA: string;
  let managerTokenA: string;
  let sellerA: string;
  let sellerB: string;
  let customerA: string;
  let customerB: string;
  let productA: string;
  let payA: string;

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await hashPassword("order-create-test");

    const a = await prisma.organization.create({
      data: {
        name: `Order A ${stamp}`,
        displayName: `Order A ${stamp}`,
        accessStatus: "ACTIVE",
        establishments: {
          create: {
            legalName: `Order A ${stamp}`,
            isPrimary: true,
            active: true,
            cnpj: null,
          },
        },
      },
    });
    orgA = a.id;
    const b = await prisma.organization.create({
      data: {
        name: `Order B ${stamp}`,
        displayName: `Order B ${stamp}`,
        accessStatus: "ACTIVE",
        establishments: {
          create: {
            legalName: `Order B ${stamp}`,
            isPrimary: true,
            active: true,
            cnpj: null,
          },
        },
      },
    });
    orgB = b.id;

    const adminA = await prisma.user.create({
      data: {
        email: `admin-a-${stamp}@iso.test`,
        passwordHash,
        name: "Admin A",
        role: "ADMIN",
        organizationId: orgA,
        activatedAt: new Date(),
      },
    });
    const managerA = await prisma.user.create({
      data: {
        email: `manager-a-${stamp}@iso.test`,
        passwordHash,
        name: "Gestor A",
        role: "MANAGER",
        organizationId: orgA,
        activatedAt: new Date(),
      },
    });
    const sellerUserA = await prisma.user.create({
      data: {
        email: `seller-a-${stamp}@iso.test`,
        passwordHash,
        name: "Vendedor A",
        role: "SELLER",
        organizationId: orgA,
        activatedAt: new Date(),
        seller: {
          create: {
            organizationId: orgA,
            commissionType: "FIXED",
            commissionPercent: 10,
            active: true,
          },
        },
      },
      include: { seller: true },
    });
    const sellerUserB = await prisma.user.create({
      data: {
        email: `seller-b-${stamp}@iso.test`,
        passwordHash,
        name: "Vendedor B",
        role: "SELLER",
        organizationId: orgB,
        activatedAt: new Date(),
        seller: {
          create: {
            organizationId: orgB,
            commissionType: "FIXED",
            commissionPercent: 10,
            active: true,
          },
        },
      },
      include: { seller: true },
    });
    sellerA = sellerUserA.seller!.id;
    sellerB = sellerUserB.seller!.id;

    const custA = await prisma.customer.create({
      data: { name: `Cliente A ${stamp}`, organizationId: orgA },
    });
    const custB = await prisma.customer.create({
      data: { name: `Cliente B ${stamp}`, organizationId: orgB },
    });
    customerA = custA.id;
    customerB = custB.id;

    const prod = await prisma.product.create({
      data: {
        name: `Produto A ${stamp}`,
        organizationId: orgA,
        basePrice: 25,
      },
    });
    productA = prod.id;
    await prisma.sellerProduct.create({
      data: { sellerId: sellerA, productId: productA },
    });

    const pay = await prisma.paymentCondition.create({
      data: {
        organizationId: orgA,
        code: `T${stamp.slice(0, 6)}`,
        name: "À vista teste",
        days: 0,
        active: true,
        sortOrder: 0,
      },
    });
    payA = pay.id;

    adminTokenA = signAccessToken({
      sub: adminA.id,
      role: "ADMIN",
      organizationId: orgA,
      sellerId: null,
    });
    managerTokenA = signAccessToken({
      sub: managerA.id,
      role: "MANAGER",
      organizationId: orgA,
      sellerId: null,
    });
  }, 60_000);

  afterAll(async () => {
    const ids = [orgA, orgB].filter(Boolean);
    if (ids.length) {
      await prisma.order.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });

  function postOrder(token: string, payload: unknown) {
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

  it("rejeita gestor com orders:none", async () => {
    const { updateOrgRolePermissions } = await import(
      "../services/role-permissions.js"
    );
    await updateOrgRolePermissions(orgA, [
      { role: "MANAGER", resource: "orders", level: "none" },
    ]);
    const res = await postOrder(managerTokenA, {
      sellerId: sellerA,
      customerId: customerA,
      paymentConditionId: payA,
      status: "DRAFT",
      items: [{ productId: productA, quantity: 1 }],
    });
    expect(res.statusCode).toBe(403);
    await updateOrgRolePermissions(orgA, [
      { role: "MANAGER", resource: "orders", level: "write" },
    ]);
  });

  it("não aceita vendedor ou cliente de outra empresa", async () => {
    const otherSeller = await postOrder(adminTokenA, {
      sellerId: sellerB,
      customerId: customerA,
      paymentConditionId: payA,
      status: "DRAFT",
      items: [{ productId: productA, quantity: 1 }],
    });
    expect(otherSeller.statusCode).toBe(400);

    const otherCustomer = await postOrder(adminTokenA, {
      sellerId: sellerA,
      customerId: customerB,
      paymentConditionId: payA,
      status: "DRAFT",
      items: [{ productId: productA, quantity: 1 }],
    });
    expect(otherCustomer.statusCode).toBe(400);
  });

  it("cria rascunho na organização do JWT com preço calculado", async () => {
    const res = await postOrder(adminTokenA, {
      sellerId: sellerA,
      customerId: customerA,
      paymentConditionId: payA,
      status: "DRAFT",
      notes: "Lançado no painel",
      items: [{ productId: productA, quantity: 2 }],
    });
    expect(res.statusCode).toBe(200);
    const order = JSON.parse(res.body) as {
      id: string;
      status: string;
      organizationId: string;
      sellerId: string;
      customerId: string;
      totalAmount: string | number;
      items: Array<{ quantity: number; productId: string }>;
    };
    expect(order.organizationId).toBe(orgA);
    expect(order.sellerId).toBe(sellerA);
    expect(order.customerId).toBe(customerA);
    expect(order.status).toBe("DRAFT");
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(2);
    expect(Number(order.totalAmount)).toBe(50);
  });
});
