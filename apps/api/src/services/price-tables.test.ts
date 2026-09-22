import {
  applySellerDiscountWithMinPrice,
  discountExceedsMinMessage,
  filterUsableTables,
  pickDefaultPriceTableId,
  PRICE_BELOW_MIN_MESSAGE,
  resolveCatalogPrice,
  type PriceTableSnapshot,
  type TableRuleInput,
} from "@pedidos/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { prisma } from "../db.js";
import { createSaleOrder } from "./create-sale-order.js";
import { ensureDefaultOrderSituations } from "./order-situations.js";
import {
  listUsablePriceTables,
  resolveSuggestedPriceTableId,
  updatePriceTable,
} from "./price-tables.js";
import { decToNum } from "../util/money.js";

function atacadoRule(overrides: Partial<TableRuleInput> = {}): TableRuleInput {
  return {
    id: "tbl-atacado",
    name: "Atacado",
    adjustmentKind: "DISCOUNT",
    adjustmentMode: "PERCENT",
    adjustmentValue: 10,
    item: null,
    qtyTiers: [],
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<PriceTableSnapshot> & Pick<PriceTableSnapshot, "id" | "name">,
): PriceTableSnapshot {
  return {
    status: "ACTIVE",
    validFrom: null,
    validTo: null,
    adjustmentKind: "DISCOUNT",
    adjustmentMode: "PERCENT",
    adjustmentValue: 0,
    items: [],
    qtyTiers: [],
    ...overrides,
  };
}

describe("tabelas de preço — resolver compartilhado", () => {
  it("TEST 1: base 10, Atacado -10% → 9", () => {
    const r = resolveCatalogPrice({
      basePrice: 10,
      quantity: 1,
      table: atacadoRule(),
    });
    expect(r.unitPrice).toBe(9);
    expect(r.origin).toBe("TABLE_RULE");
    expect(r.originLabel).toBe("Tabela Atacado");
    expect(r.priceTableId).toBe("tbl-atacado");
  });

  it("TEST 2: mesma tabela + preço personalizado 8.50 → 8.50", () => {
    const r = resolveCatalogPrice({
      basePrice: 10,
      quantity: 1,
      table: atacadoRule({
        item: { useCustomPrice: true, price: 8.5, minPrice: null },
      }),
    });
    expect(r.unitPrice).toBe(8.5);
    expect(r.origin).toBe("PRODUCT_OVERRIDE");
  });

  it("TEST 3: tabela 9, faixa 50+ = 8, qty 60 → 8", () => {
    const r = resolveCatalogPrice({
      basePrice: 10,
      quantity: 60,
      table: atacadoRule({
        adjustmentValue: 0,
        item: { useCustomPrice: true, price: 9, minPrice: null },
        qtyTiers: [{ minQuantity: 50, price: 8 }],
      }),
    });
    expect(r.unitPrice).toBe(8);
    expect(r.origin).toBe("QTY_TIER");
    expect(r.originLabel).toBe("Atacado • Faixa 50+");
  });

  it("TEST 4: tabela 9, cliente ABC especial 7.50 → 7.50 (vence faixa)", () => {
    const r = resolveCatalogPrice({
      basePrice: 10,
      quantity: 60,
      table: atacadoRule({
        adjustmentValue: 0,
        item: { useCustomPrice: true, price: 9, minPrice: null },
        qtyTiers: [{ minQuantity: 50, price: 8 }],
      }),
      customerSpecial: { price: 7.5 },
    });
    expect(r.unitPrice).toBe(7.5);
    expect(r.origin).toBe("CUSTOMER_SPECIAL");
    expect(r.originLabel).toBe("Preço especial do cliente");
    expect(r.priceTableId).toBe("tbl-atacado");
  });

  it("TEST 5: cliente com tabela padrão Atacado → pedido abre em Atacado", () => {
    const picked = pickDefaultPriceTableId({
      allowedTableIds: ["tbl-vista", "tbl-atacado"],
      customerDefaultId: "tbl-atacado",
      sellerDefaultId: "tbl-vista",
    });
    expect(picked).toBe("tbl-atacado");
  });

  it("TEST 6: Pedro sem acesso a Atacado → Atacado oculta", () => {
    const tables = [
      snapshot({ id: "tbl-atacado", name: "Atacado" }),
      snapshot({ id: "tbl-vista", name: "À Vista" }),
    ];
    const usable = filterUsableTables(tables, {
      allowedTableIds: ["tbl-vista"],
    });
    expect(usable.map((t) => t.id)).toEqual(["tbl-vista"]);
    expect(usable.some((t) => t.name === "Atacado")).toBe(false);
  });

  it("TEST 7: tabela 10, mínimo 9, tentar 8.90 → bloqueia", () => {
    const catalog = resolveCatalogPrice({
      basePrice: 10,
      quantity: 1,
      table: {
        id: "t",
        name: "Tabela",
        adjustmentKind: "DISCOUNT",
        adjustmentMode: "PERCENT",
        adjustmentValue: 0,
        item: { useCustomPrice: true, price: 10, minPrice: 9 },
        qtyTiers: [],
      },
    });
    expect(catalog.unitPrice).toBe(10);
    const blocked = applySellerDiscountWithMinPrice({
      catalogUnitPrice: 8.9,
      minPrice: catalog.minPrice,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toBe(PRICE_BELOW_MIN_MESSAGE);
  });

  it("TEST 8: tabela 10, mínimo 9, após desconto 9.50 → permite", () => {
    const allowed = applySellerDiscountWithMinPrice({
      catalogUnitPrice: 10,
      discountPercent: 5,
      minPrice: 9,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.unitPrice).toBe(9.5);
  });

  it("TEST 9: faixas 1+=10, 10+=9, 50+=8, qty 55 → 8", () => {
    const r = resolveCatalogPrice({
      basePrice: 10,
      quantity: 55,
      table: {
        id: "t",
        name: "Atacado",
        adjustmentKind: "DISCOUNT",
        adjustmentMode: "PERCENT",
        adjustmentValue: 0,
        item: null,
        qtyTiers: [
          { minQuantity: 1, price: 10 },
          { minQuantity: 10, price: 9 },
          { minQuantity: 50, price: 8 },
        ],
      },
    });
    expect(r.unitPrice).toBe(8);
    expect(r.origin).toBe("QTY_TIER");
  });

  it("desconto abaixo do mínimo usa a mensagem de excesso", () => {
    const blocked = applySellerDiscountWithMinPrice({
      catalogUnitPrice: 10,
      discountPercent: 20,
      minPrice: 9,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.message).toBe(discountExceedsMinMessage(9));
    }
  });

  it("tabela antiga só com preço por produto (sem fórmula) continua valendo", () => {
    const r = resolveCatalogPrice({
      basePrice: 12,
      quantity: 1,
      table: {
        id: "legacy",
        name: "Lista A",
        adjustmentKind: "DISCOUNT",
        adjustmentMode: "PERCENT",
        adjustmentValue: 0,
        item: { useCustomPrice: true, price: 11.3, minPrice: null },
        qtyTiers: [],
      },
    });
    expect(r.unitPrice).toBe(11.3);
    expect(r.origin).toBe("PRODUCT_OVERRIDE");
  });

  it("sem acesso restrito (lista vazia) todas as tabelas ativas ficam visíveis", () => {
    const tables = [
      snapshot({ id: "a", name: "Atacado" }),
      snapshot({ id: "b", name: "À Vista" }),
    ];
    expect(filterUsableTables(tables, { allowedTableIds: [] })).toHaveLength(2);
  });
});

const hasDb = Boolean(
  process.env.DATABASE_URL?.trim() && process.env.JWT_SECRET?.trim(),
);

describe.skipIf(!hasDb)("tabelas de preço — API/persistência", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let orgId = "";
  let sellerId = "";
  let sellerUserId = "";
  let customerId = "";
  let productId = "";
  let payId = "";
  let atacadoId = "";
  let vistaId = "";
  let pedroId = "";

  beforeAll(async () => {
    const passwordHash = await hashPassword("price-tables-test");
    const org = await prisma.organization.create({
      data: {
        name: `Price ${stamp}`,
        displayName: `Price ${stamp}`,
        accessStatus: "ACTIVE",
        establishments: {
          create: {
            legalName: `Price ${stamp}`,
            isPrimary: true,
            active: true,
            cnpj: null,
          },
        },
      },
    });
    orgId = org.id;
    await ensureDefaultOrderSituations(orgId);

    const sellerUser = await prisma.user.create({
      data: {
        email: `seller-pt-${stamp}@iso.test`,
        passwordHash,
        name: "João",
        role: "SELLER",
        organizationId: orgId,
        activatedAt: new Date(),
        seller: {
          create: {
            organizationId: orgId,
            commissionType: "FIXED",
            commissionPercent: 5,
            active: true,
          },
        },
      },
      include: { seller: true },
    });
    sellerUserId = sellerUser.id;
    sellerId = sellerUser.seller!.id;

    const pedroUser = await prisma.user.create({
      data: {
        email: `pedro-pt-${stamp}@iso.test`,
        passwordHash,
        name: "Pedro",
        role: "SELLER",
        organizationId: orgId,
        activatedAt: new Date(),
        seller: {
          create: {
            organizationId: orgId,
            commissionType: "FIXED",
            commissionPercent: 5,
            active: true,
          },
        },
      },
      include: { seller: true },
    });
    pedroId = pedroUser.seller!.id;

    const abc = await prisma.customer.create({
      data: {
        name: `ABC ${stamp}`,
        organizationId: orgId,
        approvalStatus: "APPROVED",
        status: "ACTIVE",
        sellerId,
      },
    });
    customerId = abc.id;

    const product = await prisma.product.create({
      data: {
        name: `Produto PT ${stamp}`,
        organizationId: orgId,
        basePrice: 10,
        stockQty: 500,
      },
    });
    productId = product.id;
    await prisma.sellerProduct.createMany({
      data: [
        { sellerId, productId },
        { sellerId: pedroId, productId },
      ],
    });

    const pay = await prisma.paymentCondition.create({
      data: {
        organizationId: orgId,
        code: `AV-${stamp.slice(0, 6)}`,
        name: "À vista",
        days: 0,
        active: true,
      },
    });
    payId = pay.id;

    const atacado = await prisma.priceTable.create({
      data: {
        name: "Atacado",
        organizationId: orgId,
        adjustmentKind: "DISCOUNT",
        adjustmentMode: "PERCENT",
        adjustmentValue: 10,
        status: "ACTIVE",
      },
    });
    atacadoId = atacado.id;
    const vista = await prisma.priceTable.create({
      data: {
        name: "À Vista",
        organizationId: orgId,
        adjustmentKind: "DISCOUNT",
        adjustmentMode: "PERCENT",
        adjustmentValue: 0,
        status: "ACTIVE",
      },
    });
    vistaId = vista.id;

    await prisma.customer.update({
      where: { id: customerId },
      data: { defaultPriceTableId: atacadoId },
    });
    await prisma.sellerPriceTableAccess.create({
      data: { sellerId: pedroId, priceTableId: vistaId },
    });
  });

  afterAll(async () => {
    await prisma.orderItem
      .deleteMany({ where: { order: { organizationId: orgId } } })
      .catch(() => {});
    await prisma.order.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("TEST 5 (API): cliente ABC abre pedido na tabela Atacado", async () => {
    const suggested = await resolveSuggestedPriceTableId({
      organizationId: orgId,
      sellerId,
      customerId,
    });
    expect(suggested).toBe(atacadoId);
  });

  it("TEST 6 (API): Pedro não vê Atacado", async () => {
    const joao = await listUsablePriceTables({
      organizationId: orgId,
      sellerId,
    });
    const pedro = await listUsablePriceTables({
      organizationId: orgId,
      sellerId: pedroId,
    });
    expect(joao.map((t) => t.id).sort()).toEqual([atacadoId, vistaId].sort());
    expect(pedro.map((t) => t.id)).toEqual([vistaId]);
  });

  it("TEST 10: pedido salvo a 9 não muda quando a tabela vai a 10", async () => {
    const order = await createSaleOrder({
      organizationId: orgId,
      actorUserId: sellerUserId,
      sellerId,
      customerId,
      paymentConditionId: payId,
      priceTableId: atacadoId,
      items: [{ productId, quantity: 1 }],
      status: "DRAFT",
      source: "admin",
      allowedProductIds: new Set([productId]),
    });
    expect(decToNum(order.items[0]!.unitPrice)).toBe(9);

    await updatePriceTable(orgId, atacadoId, { adjustmentValue: 0 });

    const stored = await prisma.orderItem.findFirst({
      where: { orderId: order.id },
    });
    expect(decToNum(stored!.unitPrice)).toBe(9);
  });
});
