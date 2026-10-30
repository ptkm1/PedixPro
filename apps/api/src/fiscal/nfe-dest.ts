import { onlyDigits } from "./nfe-access-key.js";

export type NfeDestIcms = {
  indIEDest: "1" | "2" | "9";
  ie: string | null;
  /** 0 = normal; 1 = consumidor final. */
  indFinal: "0" | "1";
};

/**
 * MOC NF-e 4.00:
 * indIEDest 1 = contribuinte ICMS (IE obrigatória);
 * 2 = isento;
 * 9 = não contribuinte (obrigatório indFinal=1 — cStat 696).
 */
export function resolveNfeDestIcms(input: {
  document?: string | null;
  ie?: string | null;
  stateRegistration?: string | null;
  consumerFinal?: boolean;
}): NfeDestIcms {
  const doc = onlyDigits(input.document ?? "");
  const isCpf = doc.length === 11;
  const raw = (input.stateRegistration ?? input.ie ?? "").trim();
  const upper = raw.toUpperCase();
  const digits = raw.replace(/\D/g, "");
  const forceFinal = Boolean(input.consumerFinal);

  if (isCpf) {
    return { indIEDest: "9", ie: null, indFinal: "1" };
  }

  if (upper === "ISENTO") {
    return {
      indIEDest: "2",
      ie: null,
      indFinal: forceFinal ? "1" : "0",
    };
  }

  if (digits.length >= 2) {
    return {
      indIEDest: "1",
      ie: digits,
      indFinal: forceFinal ? "1" : "0",
    };
  }

  return { indIEDest: "9", ie: null, indFinal: "1" };
}
