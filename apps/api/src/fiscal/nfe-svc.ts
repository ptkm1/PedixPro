import { UF_IBGE } from "./sefaz-endpoints.js";

/** tpEmis 6 = SVC-AN (Ambiente Nacional / SVAN unificado). */
export const TP_EMIS_SVC_AN = "6";
/** tpEmis 7 = SVC-RS (SEFAZ Virtual de Contingência do RS). */
export const TP_EMIS_SVC_RS = "7";

export type SvcAuthorizer = "SVCAN" | "SVCRS";

export type SvcTarget = {
  tpEmis: typeof TP_EMIS_SVC_AN | typeof TP_EMIS_SVC_RS;
  authorizer: SvcAuthorizer;
  label: string;
};

/**
 * UFs cuja contingência SVC ainda é a SVC-RS (tpEmis=7).
 * BA saiu: SEFAZ de origem desabilitou SVC-RS (cStat 114).
 * Demais UFs usam SVC-AN (tpEmis=6), inclusive SP/MG/RS e as UFs da SVRS.
 */
const SVC_RS_UFS = new Set([
  "AM",
  "GO",
  "MA",
  "MS",
  "MT",
  "PE",
  "PI",
  "PR",
]);

/** cStat de autorização/status que indicam SEFAZ parada. */
export const SEFAZ_UNAVAILABLE_CSTATS = new Set(["108", "109"]);

export const DEFAULT_SVC_JUSTIFICATION =
  "SEFAZ autorizadora indisponivel - emissao em SVC";

export function isSvcTpEmis(tpEmis: string | null | undefined): boolean {
  const t = String(tpEmis ?? "").slice(0, 1);
  return t === TP_EMIS_SVC_AN || t === TP_EMIS_SVC_RS;
}

export function svcForUf(uf: string | null | undefined): SvcTarget {
  const u = (uf ?? "SP").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  if (SVC_RS_UFS.has(u)) {
    return {
      tpEmis: TP_EMIS_SVC_RS,
      authorizer: "SVCRS",
      label: "SVC-RS",
    };
  }
  return {
    tpEmis: TP_EMIS_SVC_AN,
    authorizer: "SVCAN",
    label: "SVC-AN",
  };
}

/** cOrgao do evento: 91 (AN) na SVC-AN, 43 (RS) na SVC-RS, senão o IBGE da UF. */
export function sefazOrgaoForEvent(
  uf: string,
  tpEmis?: string | null,
): string {
  const t = String(tpEmis ?? "").slice(0, 1);
  if (t === TP_EMIS_SVC_AN) return "91";
  if (t === TP_EMIS_SVC_RS) return "43";
  return UF_IBGE[uf.toUpperCase()] ?? "35";
}

export function normalizeSvcJustification(
  raw?: string | null,
): string {
  const t = (raw ?? "").trim().replace(/\s+/g, " ");
  if (t.length >= 15) return t.slice(0, 256);
  return DEFAULT_SVC_JUSTIFICATION;
}

const LOCAL_TLS_RE =
  /cadeia ICP-Brasil|local issuer certificate|unable to verify the first certificate|self[- ]signed certificate/i;

const TRANSPORT_UNAVAILABLE_RE =
  /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EPIPE|EHOSTUNREACH|socket hang up|SEFAZ HTTP 5\d\d|SEFAZ HTTP 408|SEFAZ HTTP 429|network|comunica[cç][aã]o|servi[cç]o paralisado|servico paralisado|service unavailable|try again later/i;

const MOTIVO_UNAVAILABLE_RE =
  /paralisado|indispon[ií]vel|timeout|servi[cç]o parado|servico parado|service unavailable|try again later/i;

export type SefazUnavailableInput = {
  ok: boolean;
  pending?: boolean;
  error?: string;
  parsed?: { cStat?: string; xMotivo?: string };
};

/**
 * Indica se a falha é indisponibilidade da SEFAZ autorizadora
 * (vale fallback SVC). Rejeições de negócio (cStat 2xx/3xx/5xx) não entram.
 */
/** cStat 114: a SEFAZ de origem desligou a SVC-RS — reenviar na SVC-AN. */
export function isSvcRsDisabledByOrigin(
  result: SefazUnavailableInput,
): boolean {
  const cStat = result.parsed?.cStat?.trim();
  if (cStat === "114") return true;
  const text = `${result.error ?? ""} ${result.parsed?.xMotivo ?? ""}`;
  return /\b114\b/.test(text) && /SVC-RS/i.test(text);
}

export function shouldFallbackToSvc(result: SefazUnavailableInput): boolean {
  if (result.ok || result.pending) return false;

  const cStat = result.parsed?.cStat?.trim();
  if (cStat && SEFAZ_UNAVAILABLE_CSTATS.has(cStat)) return true;
  if (cStat === "999" && motivoLooksUnavailable(result.parsed?.xMotivo)) {
    return true;
  }
  if (cStat && /^\d{3}$/.test(cStat) && !SEFAZ_UNAVAILABLE_CSTATS.has(cStat)) {
    return false;
  }

  const err = result.error ?? "";
  if (LOCAL_TLS_RE.test(err)) return false;
  return (
    TRANSPORT_UNAVAILABLE_RE.test(err) ||
    motivoLooksUnavailable(result.parsed?.xMotivo)
  );
}

function motivoLooksUnavailable(xMotivo?: string): boolean {
  return Boolean(xMotivo && MOTIVO_UNAVAILABLE_RE.test(xMotivo));
}
