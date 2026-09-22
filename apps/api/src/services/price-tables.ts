import {
  isPriceTableUsable,
  pickDefaultPriceTableId,
  PRICE_BELOW_MIN_MESSAGE,
  resolveCatalogPrice,
  tableMatchesScope,
  type PriceAdjustmentKind,
  type PriceAdjustmentMode,
  type PriceTableSnapshot,
  type PricingSyncPayload,
} from "@pedidos/shared";
import { prisma } from "../db.js";
import { parseCsvText } from "./imports/csv-parse.js";
import { decToNum } from "../util/money.js";

export class PriceTableServiceError extends Error {
  constructor(
    message: string,
    readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "PriceTableServiceError";
  }
}

const tableSelect = {
  id: true,
  name: true,
  organizationId: true,
  status: true,
  validFrom: true,
  validTo: true,
  adjustmentKind: true,
  adjustmentMode: true,
  adjustmentValue: true,
  priority: true,
  customerId: true,
  sellerId: true,
  regionId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PriceTableWriteInput = {
  name?: string;
  status?: "ACTIVE" | "INACTIVE";
  validFrom?: Date | null;
  validTo?: Date | null;
  adjustmentKind?: PriceAdjustmentKind;
  adjustmentMode?: PriceAdjustmentMode;
  adjustmentValue?: number;
  priority?: number;
  customerId?: string | null;
  sellerId?: string | null;
  regionId?: string | null;
};

function serializeTable(row: {
  id: string;
  name: string;
  status: string;
  validFrom: Date | null;
  validTo: Date | null;
  adjustmentKind: PriceAdjustmentKind;
  adjustmentMode: PriceAdjustmentMode;
  adjustmentValue: unknown;
  priority: number;
  customerId: string | null;
  sellerId: string | null;
  regionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: unknown[];
  customer?: unknown;
  seller?: unknown;
  region?: unknown;
  _count?: { items: number; qtyTiers: number };
}) {
  return {
    ...row,
    adjustmentValue: decToNum(row.adjustmentValue),
  };
}

export async function listPriceTables(organizationId: string) {
  const rows = await prisma.priceTable.findMany({
    where: { organizationId },
    include: {
      items: { include: { product: { select: { id: true, name: true, sku: true, basePrice: true } } } },
      customer: { select: { id: true, name: true } },
      seller: { include: { user: { select: { name: true } } } },
      region: { select: { id: true, code: true, name: true } },
      _count: { select: { items: true, qtyTiers: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeTable);
}

export async function getPriceTable(organizationId: string, id: string) {
  const row = await prisma.priceTable.findFirst({
    where: { id, organizationId },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, basePrice: true } },
        },
      },
      qtyTiers: true,
      customer: { select: { id: true, name: true } },
      seller: { include: { user: { select: { name: true } } } },
      region: { select: { id: true, code: true, name: true } },
    },
  });
  if (!row) throw new PriceTableServiceError("Não encontrado", 404);
  return {
    ...serializeTable(row),
    items: row.items.map((i) => ({
      ...i,
      price: decToNum(i.price),
      minPrice: i.minPrice != null ? decToNum(i.minPrice) : null,
      product: {
        ...i.product,
        basePrice: decToNum(i.product.basePrice),
      },
    })),
    qtyTiers: row.qtyTiers.map((t) => ({
      ...t,
      price: decToNum(t.price),
    })),
  };
}

async function assertScopeIds(
  organizationId: string,
  d: PriceTableWriteInput,
) {
  if (d.customerId) {
    const c = await prisma.customer.findFirst({
      where: { id: d.customerId, organizationId },
      select: { id: true },
    });
    if (!c) throw new PriceTableServiceError("Cliente inválido para escopo da tabela");
  }
  if (d.sellerId) {
    const s = await prisma.seller.findFirst({
      where: { id: d.sellerId, organizationId },
      select: { id: true },
    });
    if (!s) throw new PriceTableServiceError("Vendedor inválido para escopo da tabela");
  }
  if (d.regionId) {
    const r = await prisma.region.findFirst({
      where: { id: d.regionId, organizationId },
      select: { id: true },
    });
    if (!r) throw new PriceTableServiceError("Região inválida para escopo da tabela");
  }
}

export async function createPriceTable(
  organizationId: string,
  data: PriceTableWriteInput & { name: string },
) {
  await assertScopeIds(organizationId, data);
  return prisma.priceTable.create({
    data: {
      name: data.name.trim(),
      organizationId,
      status: data.status ?? "ACTIVE",
      validFrom: data.validFrom ?? null,
      validTo: data.validTo ?? null,
      adjustmentKind: data.adjustmentKind ?? "DISCOUNT",
      adjustmentMode: data.adjustmentMode ?? "PERCENT",
      adjustmentValue: data.adjustmentValue ?? 0,
      priority: data.priority ?? 0,
      customerId: data.customerId ?? null,
      sellerId: data.sellerId ?? null,
      regionId: data.regionId ?? null,
    },
  });
}

export async function updatePriceTable(
  organizationId: string,
  id: string,
  data: PriceTableWriteInput,
) {
  const existing = await prisma.priceTable.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) throw new PriceTableServiceError("Não encontrado", 404);
  await assertScopeIds(organizationId, data);
  return prisma.priceTable.update({
    where: { id },
    data: {
      name: data.name?.trim(),
      status: data.status,
      validFrom: data.validFrom === undefined ? undefined : data.validFrom,
      validTo: data.validTo === undefined ? undefined : data.validTo,
      adjustmentKind: data.adjustmentKind,
      adjustmentMode: data.adjustmentMode,
      adjustmentValue: data.adjustmentValue,
      priority: data.priority,
      customerId: data.customerId === undefined ? undefined : data.customerId,
      sellerId: data.sellerId === undefined ? undefined : data.sellerId,
      regionId: data.regionId === undefined ? undefined : data.regionId,
    },
  });
}

export async function deletePriceTable(organizationId: string, id: string) {
  const existing = await prisma.priceTable.findFirst({
    where: { id, organizationId },
    select: { id: true, name: true },
  });
  if (!existing) throw new PriceTableServiceError("Não encontrado", 404);
  await prisma.priceTable.delete({ where: { id } });
  return existing;
}

export async function duplicatePriceTable(organizationId: string, id: string) {
  const src = await prisma.priceTable.findFirst({
    where: { id, organizationId },
    include: { items: true, qtyTiers: true },
  });
  if (!src) throw new PriceTableServiceError("Não encontrado", 404);
  return prisma.priceTable.create({
    data: {
      name: `${src.name} (cópia)`,
      organizationId,
      status: "ACTIVE",
      validFrom: src.validFrom,
      validTo: src.validTo,
      adjustmentKind: src.adjustmentKind,
      adjustmentMode: src.adjustmentMode,
      adjustmentValue: src.adjustmentValue,
      priority: src.priority,
      customerId: src.customerId,
      sellerId: src.sellerId,
      regionId: src.regionId,
      items: {
        create: src.items.map((i) => ({
          productId: i.productId,
          price: i.price,
          useCustomPrice: i.useCustomPrice,
          minPrice: i.minPrice,
        })),
      },
      qtyTiers: {
        create: src.qtyTiers.map((t) => ({
          productId: t.productId,
          minQuantity: t.minQuantity,
          price: t.price,
        })),
      },
    },
  });
}

export async function listTableCatalog(organizationId: string, tableId: string, q?: string) {
  const table = await prisma.priceTable.findFirst({
    where: { id: tableId, organizationId },
  });
  if (!table) throw new PriceTableServiceError("Tabela não encontrada", 404);

  const query = q?.trim();
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { sku: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, sku: true, basePrice: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  const [items, tiers] = await Promise.all([
    prisma.priceTableItem.findMany({ where: { priceTableId: tableId } }),
    prisma.priceTableQtyTier.findMany({ where: { priceTableId: tableId } }),
  ]);
  const itemByProduct = new Map(items.map((i) => [i.productId, i]));
  const tiersByProduct = new Map<string, typeof tiers>();
  for (const t of tiers) {
    const list = tiersByProduct.get(t.productId) ?? [];
    list.push(t);
    tiersByProduct.set(t.productId, list);
  }

  return products.map((p) => {
    const item = itemByProduct.get(p.id) ?? null;
    const productTiers = tiersByProduct.get(p.id) ?? [];
    const resolved = resolveCatalogPrice({
      basePrice: decToNum(p.basePrice),
      quantity: 1,
      table: {
        id: table.id,
        name: table.name,
        adjustmentKind: table.adjustmentKind,
        adjustmentMode: table.adjustmentMode,
        adjustmentValue: decToNum(table.adjustmentValue),
        item: item
          ? {
              useCustomPrice: item.useCustomPrice,
              price: decToNum(item.price),
              minPrice: item.minPrice != null ? decToNum(item.minPrice) : null,
            }
          : null,
        qtyTiers: productTiers.map((t) => ({
          minQuantity: t.minQuantity,
          price: decToNum(t.price),
        })),
      },
      customerSpecial: null,
    });
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      basePrice: decToNum(p.basePrice),
      computedPrice: resolved.unitPrice,
      origin: resolved.origin,
      originLabel: resolved.originLabel,
      useCustomPrice: item?.useCustomPrice ?? false,
      customPrice: item?.useCustomPrice ? decToNum(item.price) : null,
      minPrice: item?.minPrice != null ? decToNum(item.minPrice) : null,
      qtyTiers: productTiers
        .slice()
        .sort((a, b) => a.minQuantity - b.minQuantity)
        .map((t) => ({
          id: t.id,
          minQuantity: t.minQuantity,
          price: decToNum(t.price),
        })),
    };
  });
}

async function requireTable(organizationId: string, id: string) {
  const pt = await prisma.priceTable.findFirst({
    where: { id, organizationId },
  });
  if (!pt) throw new PriceTableServiceError("Tabela não encontrada", 404);
  return pt;
}

async function requireProduct(organizationId: string, productId: string) {
  const prod = await prisma.product.findFirst({
    where: { id: productId, organizationId },
  });
  if (!prod) throw new PriceTableServiceError("Produto inválido");
  return prod;
}

function assertCustomNotBelowMin(price: number, minPrice: number | null | undefined) {
  if (minPrice != null && price + 1e-9 < minPrice) {
    throw new PriceTableServiceError(PRICE_BELOW_MIN_MESSAGE);
  }
}

export async function upsertTableItem(
  organizationId: string,
  tableId: string,
  input: {
    productId: string;
    useCustomPrice?: boolean;
    price?: number | null;
    minPrice?: number | null;
  },
) {
  const table = await requireTable(organizationId, tableId);
  const prod = await requireProduct(organizationId, input.productId);
  const existing = await prisma.priceTableItem.findFirst({
    where: { priceTableId: tableId, productId: input.productId },
  });

  const useCustomPrice = input.useCustomPrice ?? existing?.useCustomPrice ?? Boolean(input.price != null);
  const price =
    input.price != null
      ? input.price
      : existing
        ? decToNum(existing.price)
        : resolveCatalogPrice({
            basePrice: decToNum(prod.basePrice),
            quantity: 1,
            table: {
              id: table.id,
              name: table.name,
              adjustmentKind: table.adjustmentKind,
              adjustmentMode: table.adjustmentMode,
              adjustmentValue: decToNum(table.adjustmentValue),
              item: null,
              qtyTiers: [],
            },
          }).unitPrice;
  const minPrice =
    input.minPrice === undefined
      ? existing?.minPrice != null
        ? decToNum(existing.minPrice)
        : null
      : input.minPrice;
  if (useCustomPrice) assertCustomNotBelowMin(price, minPrice);

  return prisma.priceTableItem.upsert({
    where: {
      priceTableId_productId: { priceTableId: tableId, productId: input.productId },
    },
    create: {
      priceTableId: tableId,
      productId: input.productId,
      price,
      useCustomPrice,
      minPrice,
    },
    update: {
      price,
      useCustomPrice,
      minPrice,
    },
  });
}

export async function deleteTableItem(
  organizationId: string,
  tableId: string,
  productId: string,
) {
  await requireTable(organizationId, tableId);
  await prisma.priceTableItem.deleteMany({
    where: { priceTableId: tableId, productId },
  });
}

export async function replaceQtyTiers(
  organizationId: string,
  tableId: string,
  productId: string,
  tiers: Array<{ minQuantity: number; price: number }>,
) {
  await requireTable(organizationId, tableId);
  await requireProduct(organizationId, productId);
  const cleaned = tiers
    .filter((t) => t.minQuantity >= 1 && t.price >= 0)
    .map((t) => ({
      minQuantity: Math.floor(t.minQuantity),
      price: t.price,
    }));
  const seen = new Set<number>();
  for (const t of cleaned) {
    if (seen.has(t.minQuantity)) {
      throw new PriceTableServiceError("Faixas duplicadas para a mesma quantidade mínima.");
    }
    seen.add(t.minQuantity);
  }
  await prisma.$transaction([
    prisma.priceTableQtyTier.deleteMany({
      where: { priceTableId: tableId, productId },
    }),
    ...(cleaned.length
      ? [
          prisma.priceTableQtyTier.createMany({
            data: cleaned.map((t) => ({
              priceTableId: tableId,
              productId,
              minQuantity: t.minQuantity,
              price: t.price,
            })),
          }),
        ]
      : []),
  ]);
  return cleaned;
}

export async function bulkUpdateTableItems(
  organizationId: string,
  tableId: string,
  input: {
    productIds: string[];
    action: "apply_percent" | "set_price" | "clear_custom";
    value?: number;
  },
) {
  const table = await requireTable(organizationId, tableId);
  if (!input.productIds.length) {
    throw new PriceTableServiceError("Selecione ao menos um produto.");
  }
  const products = await prisma.product.findMany({
    where: { organizationId, id: { in: input.productIds } },
    select: { id: true, basePrice: true },
  });
  if (products.length !== input.productIds.length) {
    throw new PriceTableServiceError("Produto inválido");
  }

  for (const p of products) {
    const base = decToNum(p.basePrice);
    if (input.action === "clear_custom") {
      await upsertTableItem(organizationId, tableId, {
        productId: p.id,
        useCustomPrice: false,
        price: resolveCatalogPrice({
          basePrice: base,
          quantity: 1,
          table: {
            id: table.id,
            name: table.name,
            adjustmentKind: table.adjustmentKind,
            adjustmentMode: table.adjustmentMode,
            adjustmentValue: decToNum(table.adjustmentValue),
            item: { useCustomPrice: false, price: null, minPrice: null },
            qtyTiers: [],
          },
        }).unitPrice,
      });
      continue;
    }
    if (input.action === "set_price") {
      const price = input.value;
      if (price == null || !Number.isFinite(price) || price < 0) {
        throw new PriceTableServiceError("Informe o preço.");
      }
      await upsertTableItem(organizationId, tableId, {
        productId: p.id,
        useCustomPrice: true,
        price,
      });
      continue;
    }
    const percent = input.value;
    if (percent == null || !Number.isFinite(percent)) {
      throw new PriceTableServiceError("Informe o percentual.");
    }
    const price = Math.round(base * (1 + percent / 100) * 100) / 100;
    await upsertTableItem(organizationId, tableId, {
      productId: p.id,
      useCustomPrice: true,
      price: Math.max(0, price),
    });
  }
  return { updated: products.length };
}

function parseMoneyCell(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function importTableCsv(
  organizationId: string,
  tableId: string,
  csvText: string,
) {
  await requireTable(organizationId, tableId);
  const parsed = parseCsvText(csvText);
  let updated = 0;
  const errors: Array<{ line: number; error: string }> = [];

  for (const row of parsed.rows) {
    const code = (row.cells.codigo ?? row.cells.sku ?? "").trim();
    const name = (row.cells.nome ?? "").trim();
    const tablePrice = parseMoneyCell(row.cells.preco_tabela ?? row.cells.preco ?? "");
    const minPrice = parseMoneyCell(row.cells.preco_minimo ?? "");
    if (!code && !name) {
      errors.push({ line: row.line, error: "Informe código ou nome do produto." });
      continue;
    }
    const product = await prisma.product.findFirst({
      where: {
        organizationId,
        OR: [
          ...(code ? [{ sku: code }, { barcode: code }] : []),
          ...(name ? [{ name }] : []),
        ],
      },
      select: { id: true },
    });
    if (!product) {
      errors.push({ line: row.line, error: "Produto não encontrado." });
      continue;
    }
    try {
      await upsertTableItem(organizationId, tableId, {
        productId: product.id,
        useCustomPrice: tablePrice != null,
        price: tablePrice,
        minPrice,
      });
      updated += 1;
    } catch (e) {
      errors.push({
        line: row.line,
        error: e instanceof Error ? e.message : "Falha ao importar linha.",
      });
    }
  }

  return { updated, errors };
}

export async function sellerAllowedTableIds(
  organizationId: string,
  sellerId: string,
): Promise<string[] | null> {
  const rows = await prisma.sellerPriceTableAccess.findMany({
    where: { sellerId, priceTable: { organizationId } },
    select: { priceTableId: true },
  });
  if (!rows.length) return null;
  return rows.map((r) => r.priceTableId);
}

export async function listUsablePriceTables(params: {
  organizationId: string;
  sellerId?: string | null;
  customerId?: string | null;
  regionId?: string | null;
  at?: Date;
}) {
  const at = params.at ?? new Date();
  const allowed = params.sellerId
    ? await sellerAllowedTableIds(params.organizationId, params.sellerId)
    : null;
  const tables = await prisma.priceTable.findMany({
    where: {
      organizationId: params.organizationId,
      status: "ACTIVE",
      ...(allowed ? { id: { in: allowed } } : {}),
    },
    select: tableSelect,
    orderBy: [{ priority: "desc" }, { name: "asc" }],
  });
  return tables.filter((t) => {
    if (!isPriceTableUsable(t, at)) return false;
    return tableMatchesScope(t, {
      customerId: params.customerId,
      sellerId: params.sellerId,
      regionId: params.regionId,
    });
  });
}

export async function assertPriceTableForNewOrder(params: {
  organizationId: string;
  priceTableId: string;
  sellerId: string;
  customerId?: string | null;
  regionId?: string | null;
  at?: Date;
}) {
  const table = await prisma.priceTable.findFirst({
    where: { id: params.priceTableId, organizationId: params.organizationId },
  });
  if (!table) throw new PriceTableServiceError("Tabela de preço inválida");
  if (!isPriceTableUsable(table, params.at ?? new Date())) {
    throw new PriceTableServiceError("Tabela de preço indisponível.");
  }
  const allowed = await sellerAllowedTableIds(params.organizationId, params.sellerId);
  if (allowed && !allowed.includes(params.priceTableId)) {
    throw new PriceTableServiceError("Vendedor sem acesso a esta tabela de preço.");
  }
  if (
    !tableMatchesScope(table, {
      customerId: params.customerId,
      sellerId: params.sellerId,
      regionId: params.regionId,
    })
  ) {
    throw new PriceTableServiceError("Tabela de preço não se aplica a este pedido.");
  }
  return table;
}

export async function resolveSuggestedPriceTableId(params: {
  organizationId: string;
  sellerId?: string | null;
  customerId?: string | null;
  regionId?: string | null;
}) {
  const usable = await listUsablePriceTables(params);
  let customerDefault: string | null = null;
  let sellerDefault: string | null = null;
  if (params.customerId) {
    const c = await prisma.customer.findFirst({
      where: { id: params.customerId, organizationId: params.organizationId },
      select: { defaultPriceTableId: true },
    });
    customerDefault = c?.defaultPriceTableId ?? null;
  }
  if (params.sellerId) {
    const s = await prisma.seller.findFirst({
      where: { id: params.sellerId, organizationId: params.organizationId },
      select: { defaultPriceTableId: true },
    });
    sellerDefault = s?.defaultPriceTableId ?? null;
  }
  return pickDefaultPriceTableId({
    allowedTableIds: usable.map((t) => t.id),
    customerDefaultId: customerDefault,
    sellerDefaultId: sellerDefault,
  });
}

export async function replaceSellerPriceTableAccess(
  organizationId: string,
  sellerId: string,
  priceTableIds: string[],
  defaultPriceTableId?: string | null,
) {
  const seller = await prisma.seller.findFirst({
    where: { id: sellerId, organizationId },
    select: { id: true },
  });
  if (!seller) throw new PriceTableServiceError("Vendedor inválido", 404);
  const unique = [...new Set(priceTableIds)];
  if (unique.length) {
    const tables = await prisma.priceTable.findMany({
      where: { organizationId, id: { in: unique } },
      select: { id: true },
    });
    if (tables.length !== unique.length) {
      throw new PriceTableServiceError("Tabela de preço inválida");
    }
  }
  if (defaultPriceTableId) {
    const ok = await prisma.priceTable.findFirst({
      where: { id: defaultPriceTableId, organizationId },
      select: { id: true },
    });
    if (!ok) throw new PriceTableServiceError("Tabela padrão inválida");
    if (unique.length && !unique.includes(defaultPriceTableId)) {
      throw new PriceTableServiceError("A tabela padrão precisa estar entre as permitidas.");
    }
  }
  await prisma.$transaction([
    prisma.sellerPriceTableAccess.deleteMany({ where: { sellerId } }),
    ...(unique.length
      ? [
          prisma.sellerPriceTableAccess.createMany({
            data: unique.map((priceTableId) => ({ sellerId, priceTableId })),
          }),
        ]
      : []),
    prisma.seller.update({
      where: { id: sellerId },
      data: {
        ...(defaultPriceTableId !== undefined
          ? { defaultPriceTableId }
          : {}),
      },
    }),
  ]);
}

export async function replaceCustomerSpecialPrices(
  organizationId: string,
  customerId: string,
  rows: Array<{
    productId: string;
    price: number;
    validFrom?: Date | null;
    validTo?: Date | null;
  }>,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!customer) throw new PriceTableServiceError("Cliente inválido", 404);
  const productIds = [...new Set(rows.map((r) => r.productId))];
  if (productIds.length) {
    const products = await prisma.product.findMany({
      where: { organizationId, id: { in: productIds } },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new PriceTableServiceError("Produto inválido");
    }
  }
  await prisma.$transaction([
    prisma.customerSpecialPrice.deleteMany({
      where: { customerId, organizationId },
    }),
    ...(rows.length
      ? [
          prisma.customerSpecialPrice.createMany({
            data: rows.map((r) => ({
              organizationId,
              customerId,
              productId: r.productId,
              price: r.price,
              validFrom: r.validFrom ?? null,
              validTo: r.validTo ?? null,
            })),
          }),
        ]
      : []),
  ]);
}

export async function loadPricingSync(params: {
  organizationId: string;
  sellerId: string;
}): Promise<PricingSyncPayload> {
  const allowed = await sellerAllowedTableIds(params.organizationId, params.sellerId);
  const tables = await prisma.priceTable.findMany({
    where: {
      organizationId: params.organizationId,
      status: "ACTIVE",
      ...(allowed ? { id: { in: allowed } } : {}),
    },
    include: { items: true, qtyTiers: true },
  });
  const seller = await prisma.seller.findFirst({
    where: { id: params.sellerId, organizationId: params.organizationId },
    select: { defaultPriceTableId: true },
  });
  const customers = await prisma.customer.findMany({
    where: {
      organizationId: params.organizationId,
      OR: [{ sellerId: params.sellerId }, { sellerId: null }],
    },
    select: { id: true },
  });
  const customerIds = customers.map((c) => c.id);
  const specials = customerIds.length
    ? await prisma.customerSpecialPrice.findMany({
        where: { organizationId: params.organizationId, customerId: { in: customerIds } },
      })
    : [];

  const snapshots: PriceTableSnapshot[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    validFrom: t.validFrom?.toISOString() ?? null,
    validTo: t.validTo?.toISOString() ?? null,
    adjustmentKind: t.adjustmentKind,
    adjustmentMode: t.adjustmentMode,
    adjustmentValue: decToNum(t.adjustmentValue),
    customerId: t.customerId,
    sellerId: t.sellerId,
    regionId: t.regionId,
    items: t.items.map((i) => ({
      productId: i.productId,
      useCustomPrice: i.useCustomPrice,
      price: decToNum(i.price),
      minPrice: i.minPrice != null ? decToNum(i.minPrice) : null,
    })),
    qtyTiers: t.qtyTiers.map((q) => ({
      productId: q.productId,
      minQuantity: q.minQuantity,
      price: decToNum(q.price),
    })),
  }));

  return {
    tables: snapshots,
    specialPrices: specials.map((s) => ({
      customerId: s.customerId,
      productId: s.productId,
      price: decToNum(s.price),
      validFrom: s.validFrom?.toISOString() ?? null,
      validTo: s.validTo?.toISOString() ?? null,
    })),
    sellerDefaultPriceTableId: seller?.defaultPriceTableId ?? null,
  };
}
