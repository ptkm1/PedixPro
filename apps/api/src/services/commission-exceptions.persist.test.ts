import { COMMISSION_ORIGIN } from "@pedidos/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { prisma } from "../db.js";
import { createSaleOrder, sellerAllowedProductIds } from "./create-sale-order.js";

const hasDb = Boolean(
  process.env.DATABASE_URL?.trim() && process.env.JWT_SECRET?.trim(),
);

describe.skipIf(!hasDb)("comissões produto/tabela — persistência (TEST 7)", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let orgId = "";
  let actorUserId = "";
  let joaoId = "";
  let pedroId = "";
  let customerId = "";
  let productId = "";
  let payId = "";
  let aVistaId = "";
  let atacadoId = "";
  let distribuidorId = "";
  let aPrazoId = "";

  beforeAll(async () => {
    const passwordHash = await hashPassword("commission-test");
    const org = await prisma.organization.create({
      data: {
        name: `Comm ${stamp}`,
        displayName: `Comm ${stamp}`,
        accessStatus: "ACTIVE",
        establishments: {
          create: {
            legalName: `Comm ${stamp}`,
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
        email: `admin-comm-${stamp}@iso.test`,
        passwordHash,
        name: "Admin Comm",
        role: "ADMIN",
        organizationId: orgId,
        activatedAt: new Date(),
      },
    });
    actorUserId = admin.id;

    const joao = await prisma.user.create({
      data: {
        email: `joao-${stamp}@iso.test`,
        passwordHash,
        name: "João",
        role: "SELLER",
        organizationId: orgId,
        activatedAt: new Date(),
        seller: {
          create: {
            organizationId: orgId,
            commissionType: "BY_PRODUCT",
            commissionPercent: 0,
            active: true,
          },
        },
      },
      include: { seller: true },
    });
    const pedro = await prisma.user.create({
      data: {
        email: `pedro-${stamp}@iso.test`,
        passwordHash,
        name: "Pedro",
        role: "SELLER",
        organizationId: orgId,
        activatedAt: new Date(),
        seller: {
          create: {
            organizationId: orgId,
            commissionType: "BY_PRODUCT",
            commissionPercent: 0,
            active: true,
          },
        },
      },
      include: { seller: true },
    });
    joaoId = joao.seller!.id;
    pedroId = pedro.seller!.id;

    const customer = await prisma.customer.create({
      data: { name: `Cliente ${stamp}`, organizationId: orgId },
    });
    customerId = customer.id;

    const product = await prisma.product.create({
      data: {
        name: `Produto ${stamp}`,
        organizationId: orgId,
        basePrice: 100,
        commissionPercent: 10,
        stockQty: 100,
        blockSaleWhenOutOfStock: false,
      },
    });
    productId = product.id;
    await prisma.sellerProduct.createMany({
      data: [
        { sellerId: joaoId, productId },
        { sellerId: pedroId, productId },
      ],
    });

    const pay = await prisma.paymentCondition.create({
      data: {
        organizationId: orgId,
        code: `C${stamp.slice(0, 6)}`,
        name: "À vista",
        days: 0,
        active: true,
        sortOrder: 0,
      },
    });
    payId = pay.id;

    const [aVista, atacado, distribuidor, aPrazo] = await Promise.all([
      prisma.priceTable.create({
        data: { name: "À Vista", organizationId: orgId },
      }),
      prisma.priceTable.create({
        data: { name: "Atacado", organizationId: orgId },
      }),
      prisma.priceTable.create({
        data: { name: "Distribuidor", organizationId: orgId },
      }),
      prisma.priceTable.create({
        data: { name: "A Prazo", organizationId: orgId },
      }),
    ]);
    aVistaId = aVista.id;
    atacadoId = atacado.id;
    distribuidorId = distribuidor.id;
    aPrazoId = aPrazo.id;

    await prisma.priceTableItem.createMany({
      data: [aVistaId, atacadoId, distribuidorId, aPrazoId].map((priceTableId) => ({
        priceTableId,
        productId,
        price: 100,
      })),
    });

    await prisma.productSellerCommission.create({
      data: {
        organizationId: orgId,
        productId,
        sellerId: pedroId,
        commissionPercent: 8,
      },
    });
    await prisma.productPriceTableCommission.createMany({
      data: [
        {
          organizationId: orgId,
          productId,
          priceTableId: atacadoId,
          commissionPercent: 5,
        },
        {
          organizationId: orgId,
          productId,
          priceTableId: distribuidorId,
          commissionPercent: 4,
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    if (orgId) {
      await prisma.order.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  async function sell(sellerId: string, priceTableId: string) {
    return createSaleOrder({
      organizationId: orgId,
      actorUserId,
      sellerId,
      customerId,
      paymentConditionId: payId,
      priceTableId,
      items: [{ productId, quantity: 1 }],
      status: "CONFIRMED",
      source: "admin",
      allowedProductIds: await sellerAllowedProductIds(sellerId, orgId),
    });
  }

  it("TEST 1–6: prioridade tabela > vendedor > produto", async () => {
    const t1 = await sell(joaoId, aVistaId);
    expect(Number(t1.items[0]?.commissionPercent)).toBe(10);
    expect(t1.items[0]?.commissionOrigin).toBe(COMMISSION_ORIGIN.PRODUCT);

    const t2 = await sell(pedroId, aVistaId);
    expect(Number(t2.items[0]?.commissionPercent)).toBe(8);
    expect(t2.items[0]?.commissionOrigin).toBe(
      COMMISSION_ORIGIN.PRODUCT_SELLER,
    );

    const t3 = await sell(joaoId, atacadoId);
    expect(Number(t3.items[0]?.commissionPercent)).toBe(5);
    expect(t3.items[0]?.commissionOrigin).toBe(COMMISSION_ORIGIN.PRICE_TABLE);

    const t4 = await sell(pedroId, atacadoId);
    expect(Number(t4.items[0]?.commissionPercent)).toBe(5);

    const t5 = await sell(pedroId, distribuidorId);
    expect(Number(t5.items[0]?.commissionPercent)).toBe(4);

    const t6 = await sell(pedroId, aPrazoId);
    expect(Number(t6.items[0]?.commissionPercent)).toBe(8);
    expect(t6.items[0]?.commissionOrigin).toBe(
      COMMISSION_ORIGIN.PRODUCT_SELLER,
    );
  });

  it("TEST 7: pedido antigo permanece 5% depois que Atacado vira 4%", async () => {
    const oldOrder = await sell(pedroId, atacadoId);
    expect(Number(oldOrder.items[0]?.commissionPercent)).toBe(5);
    expect(Number(oldOrder.items[0]?.commissionAmount)).toBe(5);
    expect(oldOrder.items[0]?.commissionOrigin).toBe(
      COMMISSION_ORIGIN.PRICE_TABLE,
    );

    await prisma.productPriceTableCommission.updateMany({
      where: {
        organizationId: orgId,
        productId,
        priceTableId: atacadoId,
      },
      data: { commissionPercent: 4 },
    });

    const stillOld = await prisma.orderItem.findFirst({
      where: { id: oldOrder.items[0]!.id },
    });
    expect(Number(stillOld?.commissionPercent)).toBe(5);
    expect(Number(stillOld?.commissionAmount)).toBe(5);
    expect(stillOld?.commissionOrigin).toBe(COMMISSION_ORIGIN.PRICE_TABLE);

    const newOrder = await sell(pedroId, atacadoId);
    expect(Number(newOrder.items[0]?.commissionPercent)).toBe(4);
    expect(Number(newOrder.items[0]?.commissionAmount)).toBe(4);
    expect(newOrder.items[0]?.commissionOrigin).toBe(
      COMMISSION_ORIGIN.PRICE_TABLE,
    );
  });
});
