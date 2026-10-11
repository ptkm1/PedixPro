export type ProductSearchable = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category?: { name: string } | null;
};

/** Remove acentos e normaliza para comparação. */
export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function tokenize(value: string): string[] {
  return foldSearchText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Distância de edição limitada (typos leves). */
function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function tokenMatchScore(queryToken: string, hayToken: string): number {
  if (!queryToken || !hayToken) return 0;
  if (hayToken === queryToken) return 100;
  if (hayToken.startsWith(queryToken)) return 80;
  if (queryToken.startsWith(hayToken) && hayToken.length >= 3) return 55;
  if (hayToken.includes(queryToken)) return 60;
  if (queryToken.length >= 3 && hayToken.length >= 3) {
    const d = editDistance(queryToken, hayToken, 2);
    if (d === 1) return 42;
    if (d === 2 && queryToken.length >= 5) return 22;
  }
  return 0;
}

function bestTokenScore(queryToken: string, hayTokens: string[]): number {
  let best = 0;
  for (const ht of hayTokens) {
    const s = tokenMatchScore(queryToken, ht);
    if (s > best) best = s;
    if (best >= 100) break;
  }
  return best;
}

/**
 * Pontuação de relevância (>0 = match).
 * Suporta parcial, tokens fora de ordem, sem acento/case e typos leves.
 */
export function scoreProductSearch(p: ProductSearchable, q: string): number {
  const raw = q.trim();
  if (!raw) return 1;

  const qFold = foldSearchText(raw);
  const qTokens = tokenize(raw);
  if (!qFold || qTokens.length === 0) return 1;

  const nameFold = foldSearchText(p.name);
  const nameTokens = tokenize(p.name);
  const skuFold = foldSearchText(p.sku ?? "");
  const barcodeFold = foldSearchText(p.barcode ?? "");
  const categoryFold = foldSearchText(p.category?.name ?? "");
  const categoryTokens = tokenize(p.category?.name ?? "");

  let score = 0;

  if (nameFold === qFold) score += 1000;
  else if (nameFold.startsWith(qFold)) score += 520;
  else if (nameFold.includes(qFold)) score += 220;

  if (skuFold) {
    if (skuFold === qFold) score += 900;
    else if (skuFold.startsWith(qFold)) score += 480;
    else if (skuFold.includes(qFold)) score += 280;
  }
  if (barcodeFold) {
    if (barcodeFold === qFold) score += 900;
    else if (barcodeFold.includes(qFold)) score += 260;
  }
  if (categoryFold.includes(qFold)) score += 80;

  const hayForTokens = [
    ...nameTokens,
    ...(skuFold ? [skuFold] : []),
    ...(barcodeFold ? [barcodeFold] : []),
    ...categoryTokens,
  ];

  let tokenTotal = 0;
  let matchedTokens = 0;
  for (const qt of qTokens) {
    const ts = bestTokenScore(qt, hayForTokens);
    if (ts > 0) {
      matchedTokens += 1;
      tokenTotal += ts;
    }
  }

  // Todos os termos precisam casar (ordem livre), ou já houve substring no nome/SKU/código.
  if (matchedTokens < qTokens.length && score === 0) return 0;

  score += tokenTotal;
  // Prefere nomes mais curtos em empate aproximado (mais específico).
  if (score > 0) {
    score += Math.max(0, 40 - Math.min(40, nameTokens.length * 2));
  }
  return score;
}

export function matchesProductSearch(p: ProductSearchable, q: string): boolean {
  const s = q.trim();
  if (!s) return true;
  return scoreProductSearch(p, s) > 0;
}

export function filterCustomersByName<T extends { name: string }>(
  customers: T[],
  q: string,
): T[] {
  const s = foldSearchText(q);
  if (!s) return customers;
  return customers.filter((c) => foldSearchText(c.name).includes(s));
}
