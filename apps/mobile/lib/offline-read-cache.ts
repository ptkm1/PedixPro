import { runOfflineDb } from "./offline-db";

type Row = { id: string; payload: string };

async function replaceEntityTable(
  table: "cache_products" | "cache_customers" | "cache_sales",
  rows: Array<{ id: string; payload: unknown }>,
): Promise<boolean> {
  const now = Date.now();
  return runOfflineDb(async (db) => {
    await db.execAsync("BEGIN");
    try {
      await db.runAsync(`DELETE FROM ${table}`);
      for (const row of rows) {
        await db.runAsync(
          `INSERT INTO ${table} (id, payload, updated_at_ms) VALUES (?, ?, ?)`,
          row.id,
          JSON.stringify(row.payload),
          now,
        );
      }
      await db.execAsync("COMMIT");
      return true;
    } catch (e) {
      await db.execAsync("ROLLBACK");
      throw e;
    }
  }, false);
}

async function getEntityTable<T>(
  table: "cache_products" | "cache_customers" | "cache_sales",
): Promise<T[]> {
  return runOfflineDb(async (db) => {
    const rows = await db.getAllAsync<Row>(
      `SELECT id, payload FROM ${table} ORDER BY id`,
    );
    const out: T[] = [];
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.payload) as T);
      } catch {
        /* skip corrupt */
      }
    }
    return out;
  }, [] as T[]);
}

export async function replaceCachedProducts(
  products: Array<{ id: string } & Record<string, unknown>>,
): Promise<boolean> {
  return replaceEntityTable(
    "cache_products",
    products.map((p) => ({ id: p.id, payload: p })),
  );
}

export async function getCachedProducts<T>(): Promise<T[]> {
  return getEntityTable<T>("cache_products");
}

export async function replaceCachedCustomers(
  customers: Array<{ id: string } & Record<string, unknown>>,
): Promise<boolean> {
  return replaceEntityTable(
    "cache_customers",
    customers.map((c) => ({ id: c.id, payload: c })),
  );
}

export async function getCachedCustomers<T>(): Promise<T[]> {
  return getEntityTable<T>("cache_customers");
}

export async function getCachedCustomerById<T>(id: string): Promise<T | null> {
  return runOfflineDb(async (db) => {
    const row = await db.getFirstAsync<Row>(
      `SELECT id, payload FROM cache_customers WHERE id = ?`,
      id,
    );
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as T;
    } catch {
      return null;
    }
  }, null);
}

/** Actualiza ou insere um cliente no cache (após GET detalhe online). */
export async function upsertCachedCustomer(
  customer: { id: string } & Record<string, unknown>,
): Promise<boolean> {
  const now = Date.now();
  return runOfflineDb(async (db) => {
    await db.runAsync(
      `INSERT INTO cache_customers (id, payload, updated_at_ms) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at_ms = excluded.updated_at_ms`,
      customer.id,
      JSON.stringify(customer),
      now,
    );
    return true;
  }, false);
}

export async function replaceCachedSales(
  sales: Array<{ id: string } & Record<string, unknown>>,
): Promise<boolean> {
  return replaceEntityTable(
    "cache_sales",
    sales.map((s) => ({ id: s.id, payload: s })),
  );
}

export async function getCachedSales<T>(): Promise<T[]> {
  return getEntityTable<T>("cache_sales");
}

export async function setCacheMeta(
  key: string,
  value: unknown,
): Promise<boolean> {
  const now = Date.now();
  return runOfflineDb(async (db) => {
    await db.runAsync(
      `INSERT INTO cache_meta (key, value, updated_at_ms) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms`,
      key,
      JSON.stringify(value),
      now,
    );
    return true;
  }, false);
}

export async function getCacheMeta<T>(key: string): Promise<T | null> {
  return runOfflineDb(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM cache_meta WHERE key = ?`,
      key,
    );
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }, null);
}

export const CACHE_META_COMMISSION = "commission_dashboard";
export const CACHE_META_ORG_SETTINGS = "org_settings";
export const CACHE_META_PRICING = "pricing_sync";
export const CACHE_META_LAST_SYNC = "last_sync_at";
export const CACHE_META_LAST_SYNC_COUNT = "last_sync_count";

export async function markCacheSynced(syncedCount?: number): Promise<void> {
  await setCacheMeta(CACHE_META_LAST_SYNC, new Date().toISOString());
  if (typeof syncedCount === "number" && syncedCount > 0) {
    await setCacheMeta(CACHE_META_LAST_SYNC_COUNT, syncedCount);
  }
}

export async function getLastCacheSyncAt(): Promise<Date | null> {
  const raw = await getCacheMeta<string>(CACHE_META_LAST_SYNC);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getLastSyncedItemCount(): Promise<number | null> {
  const raw = await getCacheMeta<number>(CACHE_META_LAST_SYNC_COUNT);
  return typeof raw === "number" && raw > 0 ? raw : null;
}
