export type ImportFieldError = { field: string; message: string };

export type ImportRowResult = {
  line: number;
  status: "ok" | "error";
  errors: ImportFieldError[];
  /** Avisos (ex.: IBGE corrigido / pendente) — não bloqueiam a linha. */
  warnings?: string[];
  preview?: Record<string, string>;
};

export type ImportPreviewResult = {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  createdCount?: number;
  rows: ImportRowResult[];
};

export function summarizeImportRows(
  rows: ImportRowResult[],
  createdCount?: number,
): ImportPreviewResult {
  const validCount = rows.filter((r) => r.status === "ok").length;
  return {
    totalRows: rows.length,
    validCount,
    invalidCount: rows.length - validCount,
    ...(createdCount !== undefined ? { createdCount } : {}),
    rows,
  };
}
