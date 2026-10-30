/**
 * Mapa de rejeições SEFAZ conhecidas → orientação ao usuário.
 * Só inclui códigos com orientação confiável. Desconhecidos: sem sugestão inventada.
 */

export type SefazRejectionHint = {
  cStat: string;
  title: string;
  /** Campo relacionado, quando identificável. */
  relatedField?: string;
  /** Sugestão segura de correção. */
  howToFix?: string;
};

const KNOWN: Record<string, Omit<SefazRejectionHint, "cStat">> = {
  "696": {
    title: "Não contribuinte deve ser consumidor final",
    howToFix:
      "indIEDest=9 exige indFinal=1. Se o destinatário é CNPJ com IE, o XML precisa da IE (indIEDest=1). Confira a inscrição estadual no cadastro do cliente.",
  },
  "487": {
    title: "Escritório de contabilidade não cadastrado na SEFAZ-BA",
    howToFix:
      "Use no autXML o CNPJ da SEFAZ-BA 13.937.073/0001-56 (não o 13.937.075). Retransmita a mesma nota.",
  },
  "486": {
    title: "Grupo autXML obrigatório na Bahia",
    howToFix:
      "A SEFAZ-BA exige o escritório de contabilidade no XML. Sem CNPJ do contador, o Pedix informa o CNPJ da SEFAZ-BA (13.937.075/0001-56). Retransmita a mesma nota.",
  },
  "703": {
    title: "Data-hora de emissão posterior ao horário de recebimento",
    howToFix:
      "A data/hora da NF-e estava à frente do relógio da SEFAZ. Retransmita a mesma nota — o Pedix grava dhEmi no horário de Brasília.",
  },
  "114": {
    title: "SVC-RS desabilitada pela SEFAZ de origem",
    howToFix:
      "A SEFAZ de origem desabilitou a SVC. O Pedix volta automaticamente para emissão normal (tpEmis 1) no webservice da UF. Retransmita a mesma nota.",
  },
  "215": {
    title: "Falha no schema XML",
    howToFix:
      "Verifique se todos os campos obrigatórios da NF-e estão preenchidos corretamente.",
  },
  "225": {
    title: "Falha no Schema XML do lote de NFe",
    howToFix:
      "O XML saiu com campo vazio ou grupo tributário inválido. Confira NCM (8 dígitos), CFOP, unidade (até 6 letras), CST PIS/COFINS (ex.: 04 em PISNT, não em alíquota), CSOSN/CST de ICMS, código IBGE do emitente e endereço sem campos em branco.",
  },
  "539": {
    title: "Duplicidade de NF-e",
    relatedField: "number",
    howToFix: "Não retransmita a mesma nota. Consulte a NF-e já autorizada.",
  },
  "590": {
    title: "Informação fiscal do produto incompatível com a operação",
    relatedField: "ncm",
    howToFix:
      "Verifique o NCM e a classificação tributária informados no cadastro do produto.",
  },
  "778": {
    title: "Informado NCM inexistente",
    relatedField: "ncm",
    howToFix: "Selecione um NCM válido na tabela fiscal do cadastro do produto.",
  },
  "806": {
    title: "Informação do produto incompatível com a operação",
    relatedField: "ncm",
    howToFix:
      "Verifique o NCM/classificação tributária informado no cadastro do produto.",
  },
  "870": {
    title: "CEST inexistente ou inválido",
    relatedField: "fiscalCest",
    howToFix: "Informe um CEST válido relacionado ao NCM do produto, se aplicável.",
  },
};

export type ParsedSefazRejection = {
  cStat: string | null;
  xMotivo: string;
  hint: SefazRejectionHint | null;
  /** Texto amigável para exibir na UI. */
  userMessage: string;
};

/**
 * Extrai cStat / motivo de uma string de rejeição e anexa orientação conhecida.
 */
export function explainSefazRejection(
  raw: string | null | undefined,
  cStatFromParsed?: string | null,
): ParsedSefazRejection {
  const text = (raw ?? "").trim() || "Rejeitada pela SEFAZ";
  let cStat =
    (cStatFromParsed ?? "").replace(/\D/g, "").slice(0, 3) ||
    null;

  if (!cStat) {
    const m =
      text.match(/\bcStat\s*[:=]?\s*(\d{3})\b/i) ||
      text.match(/\brejei[cç][aã]o\s+(\d{3})\b/i) ||
      text.match(/\b(\d{3})\s*[-–—]\s*/);
    if (m) cStat = m[1];
  }

  const known = cStat ? KNOWN[cStat] : undefined;
  const hint = known && cStat ? { cStat, ...known } : null;

  const lines = [
    cStat ? `Rejeição ${cStat}` : "Rejeição SEFAZ",
    hint?.title ?? text,
  ];
  if (hint?.title && hint.title !== text) {
    lines.push(text);
  }
  if (hint?.howToFix) {
    lines.push(`Como corrigir: ${hint.howToFix}`);
  }

  return {
    cStat,
    xMotivo: text,
    hint,
    userMessage: lines.filter(Boolean).join("\n"),
  };
}

export function knownSefazRejectionCodes(): string[] {
  return Object.keys(KNOWN).sort();
}
