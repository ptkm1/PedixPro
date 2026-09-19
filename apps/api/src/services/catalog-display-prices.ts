import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import type { CatalogProductPrice } from "@pedidos/shared";
import { filterValidCatalogPrices } from "@pedidos/shared";

/**
 * Carrega preços de catálogo em lote (sem N+1): tabelas vigentes da org + itens > 0.
 * Só visualização — não altera resolução de preço do pedido.
 */
export async function loadCatalogDisplayPricesByProduct(
  organizationId: string,
  productIds: string[],
  at: Date = new Date(),
): Promise<Map<string, CatalogProductPrice[]>> {
  const out = new Map<string, CatalogProductPrice[]>();
  if (!productIds.length) return out;

  const tables = await prisma.priceTable.findMany({
    where: {
      organizationId,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
        { OR: [{ validTo: null }, { validTo: { gte: at } }] },
      ],
    },
    select: { id: true, name: true },
  });
  if (!tables.length) return out;

  const tableNameById = new Map(tables.map((t) => [t.id, t.name]));
  const tableIds = tables.map((t) => t.id);

  const items = await prisma.priceTableItem.findMany({
    where: {
      productId: { in: productIds },
      priceTableId: { in: tableIds },
      price: { gt: 0 },
    },
    select: {
      productId: true,
      priceTableId: true,
      price: true,
    },
  });

  for (const item of items) {
    const name = tableNameById.get(item.priceTableId);
    if (!name) continue;
    const price = decToNum(item.price);
    const list = out.get(item.productId) ?? [];
    list.push({
      priceTableId: item.priceTableId,
      priceTableName: name,
      price,
    });
    out.set(item.productId, list);
  }

  for (const [productId, list] of out) {
    out.set(productId, filterValidCatalogPrices(list));
  }

  return out;
}
