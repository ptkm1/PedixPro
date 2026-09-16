import {
    CSV_IMPORT_MAX_CHARS,
    CSV_IMPORT_MAX_ROWS,
    normalizeCsvHeader,
    type CsvColumnMap,
} from "@pedidos/shared";

export type CsvParseResult = {
  headers: string[];
  rows: Array<{ line: number; cells: Record<string, string> }>;
};

export { normalizeCsvHeader };

/** Aplica mapeamento target←source; mantém células originais e sobrescreve alvos. */
export function remapCsvCells(
  cells: Record<string, string>,
  columnMap: CsvColumnMap | undefined,
): Record<string, string> {
  if (!columnMap) return cells;
  const out: Record<string, string> = { ...cells };
  for (const [target, source] of Object.entries(columnMap)) {
    const src = (source ?? "").trim();
    if (!src) continue;
    const t = normalizeCsvHeader(target);
    const s = normalizeCsvHeader(src);
    if (!t) continue;
    const next = (cells[s] ?? cells[src] ?? "").trim();
    // Não apagar valor já presente (ex.: cidade preenchida) com fonte vazia.
    if (!next && (out[t] ?? "").trim()) continue;
    out[t] = next;
  }
  return out;
}

function detectDelimiter(headerLine: string): ";" | "," {
  const semis = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semis >= commas ? ";" : ",";
}

/** Parse CSV com aspas, BOM e delimitador ; ou ,. */
export function parseCsvText(csvText: string): CsvParseResult {
  const text = csvText.replace(/^\uFEFF/, "");
  if (text.length > CSV_IMPORT_MAX_CHARS) {
    throw new Error(
      `Arquivo muito grande (máx. ${Math.round(CSV_IMPORT_MAX_CHARS / 1000)} mil caracteres).`,
    );
  }

  const lines = splitCsvLines(text);
  if (lines.length === 0) {
    throw new Error("CSV vazio.");
  }

  const delimiter = detectDelimiter(lines[0]!);
  const headers = parseCsvLine(lines[0]!, delimiter).map(normalizeCsvHeader);
  if (headers.length === 0 || headers.every((h) => !h)) {
    throw new Error("Cabeçalho do CSV inválido.");
  }

  const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);
  if (dataLines.length > CSV_IMPORT_MAX_ROWS) {
    throw new Error(
      `Muitas linhas (máx. ${CSV_IMPORT_MAX_ROWS}). Divida o arquivo.`,
    );
  }

  const rows: CsvParseResult["rows"] = [];
  for (let i = 0; i < dataLines.length; i++) {
    const values = parseCsvLine(dataLines[i]!, delimiter);
    const cells: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c]!;
      if (!key) continue;
      const val = (values[c] ?? "").trim();
      // Cabeçalho duplicado: não sobrescrever valor preenchido com vazio.
      if (!val && (cells[key] ?? "").trim()) continue;
      cells[key] = val;
    }
    rows.push({ line: i + 2, cells }); // +2: header is line 1
  }

  return { headers, rows };
}

function splitCsvLines(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length) out.push(cur);
  return out;
}

function parseCsvLine(line: string, delimiter: ";" | ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function cell(cells: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = cells[normalizeCsvHeader(k)];
    if (v != null && v.trim() !== "") return v.trim();
  }
  // also try raw keys
  for (const k of keys) {
    const v = cells[k];
    if (v != null && v.trim() !== "") return v.trim();
  }
  return "";
}

export function parseBrNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  // Moeda / placeholders comuns em export de ERP
  s = s.replace(/^R\$\s?/i, "");
  if (!s || s === "-" || /^n\/?a$/i.test(s) || /^-+$/.test(s)) return null;
  // 1.234,56 | 1234,56 | 1.234.567 | 1234.56 | 1.000
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // milhares BR sem decimal: 1.000 / 1.000.000
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseYesNo(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (["sim", "s", "yes", "y", "1", "true"].includes(t)) return true;
  if (["nao", "não", "n", "no", "0", "false"].includes(t)) return false;
  return null;
}
