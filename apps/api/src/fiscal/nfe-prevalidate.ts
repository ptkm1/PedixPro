import { isValidNfeAccessKey } from "./nfe-access-key.js";
import { SEFAZ_BA_AUTXML_CNPJ } from "./nfe-xml-builder.js";

export type NfePrevalidateIssue = {
  field: string;
  code: string;
  message: string;
};

export type NfePrevalidateResult = {
  valid: boolean;
  errors: NfePrevalidateIssue[];
  warnings: NfePrevalidateIssue[];
};

function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}>([^<]*)</${name}>`, "i");
  return re.exec(xml)?.[1]?.trim() ?? null;
}

/**
 * Validações locais no XML já montado. Falha = não transmite à SEFAZ.
 */
export function validateNfeBeforeTransmission(input: {
  infNFeXml: string;
  uf: string;
  homologation: boolean;
  tpEmis: string;
  accessKey: string;
}): NfePrevalidateResult {
  const xml = input.infNFeXml;
  const errors: NfePrevalidateIssue[] = [];
  const warnings: NfePrevalidateIssue[] = [];

  if (!isValidNfeAccessKey(input.accessKey)) {
    errors.push({
      field: "chNFe",
      code: "INVALID_KEY",
      message: "Chave de acesso inválida (44 dígitos / DV módulo 11).",
    });
  }

  const tpAmb = tag(xml, "tpAmb");
  const expectedAmb = input.homologation ? "2" : "1";
  if (tpAmb !== expectedAmb) {
    errors.push({
      field: "ide.tpAmb",
      code: "TPAMB_MISMATCH",
      message: `Ambiente do XML (${tpAmb}) diferente do cadastro (${expectedAmb}).`,
    });
  }

  const tpEmisXml = tag(xml, "tpEmis");
  if (tpEmisXml !== String(input.tpEmis).slice(0, 1)) {
    errors.push({
      field: "ide.tpEmis",
      code: "TPEMIS_MISMATCH",
      message: "tpEmis do XML não confere com o da transmissão.",
    });
  }

  const dhEmi = tag(xml, "dhEmi") ?? "";
  if (!/[+-]\d{2}:\d{2}$/.test(dhEmi) || /Z$/i.test(dhEmi)) {
    errors.push({
      field: "ide.dhEmi",
      code: "DHEMI_TZ",
      message: "dhEmi deve ter fuso (ex.: -03:00), não UTC.",
    });
  } else {
    const parsed = Date.parse(dhEmi);
    if (Number.isFinite(parsed) && parsed - Date.now() > 5 * 60 * 1000) {
      errors.push({
        field: "ide.dhEmi",
        code: "DHEMI_FUTURE",
        message: "dhEmi está no futuro (rejeição 703).",
      });
    }
  }

  const indIEDest = tag(xml, "indIEDest");
  const indFinal = tag(xml, "indFinal");
  if (indIEDest === "9" && indFinal !== "1") {
    errors.push({
      field: "ide.indFinal",
      code: "CSTAT_696",
      message:
        "Não contribuinte (indIEDest=9) exige consumidor final (indFinal=1).",
    });
  }

  const uf = input.uf.toUpperCase();
  if (uf === "BA" && !xml.includes("<autXML>")) {
    errors.push({
      field: "autXML",
      code: "CSTAT_486",
      message: `Bahia exige autXML (CNPJ ${SEFAZ_BA_AUTXML_CNPJ} se não houver contador).`,
    });
  }

  const ncm = tag(xml, "NCM") ?? "";
  if (!ncm || ncm === "00000000" || ncm.length !== 8) {
    errors.push({
      field: "det.NCM",
      code: "NCM",
      message: "NCM do item deve ter 8 dígitos.",
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function formatNfePrevalidateError(result: NfePrevalidateResult): string {
  const lines = result.errors.map((e) => `${e.field}: ${e.message}`);
  return `NF-e não transmitida devido a erro de validação local.\n${lines.join("\n")}`;
}
