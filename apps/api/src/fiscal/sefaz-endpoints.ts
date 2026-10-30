/** Códigos IBGE UF (2 dígitos) para chave NF-e. */
export const UF_IBGE: Record<string, string> = {
  AC: "12",
  AL: "27",
  AM: "13",
  AP: "16",
  BA: "29",
  CE: "23",
  DF: "53",
  ES: "32",
  GO: "52",
  MA: "21",
  MG: "31",
  MS: "50",
  MT: "51",
  PA: "15",
  PB: "25",
  PE: "26",
  PI: "22",
  PR: "41",
  RJ: "33",
  RN: "24",
  RO: "11",
  RR: "14",
  RS: "43",
  SC: "42",
  SE: "28",
  SP: "35",
  TO: "17",
};

/** Estados que usam SVRS para autorização NF-e. */
const SVRS_STATES = new Set([
  "AC",
  "AL",
  "AP",
  "DF",
  "ES",
  "MG",
  "PA",
  "PB",
  "PI",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "TO",
]);

function baWebservice(homologation: boolean, service: string): string {
  const host = homologation ? "hnfe.sefaz.ba.gov.br" : "nfe.sefaz.ba.gov.br";
  return `https://${host}/webservices/${service}/${service}.asmx`;
}

/** URLs da SVC-AN (SVAN unificado) e SVC-RS para autorização/eventos/consulta. */
export function getSvcAutorizacaoUrl(
  authorizer: "SVCAN" | "SVCRS",
  homologation: boolean,
): string {
  if (authorizer === "SVCAN") {
    return homologation
      ? "https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx"
      : "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx";
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx";
}

export function getSvcRecepcaoEventoUrl(
  authorizer: "SVCAN" | "SVCRS",
  homologation: boolean,
): string {
  if (authorizer === "SVCAN") {
    return homologation
      ? "https://hom.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx"
      : "https://www.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx";
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx";
}

export function getSvcConsultaProtocoloUrl(
  authorizer: "SVCAN" | "SVCRS",
  homologation: boolean,
): string {
  if (authorizer === "SVCAN") {
    return homologation
      ? "https://hom.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx"
      : "https://www.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx";
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx";
}

function svcAuthorizerFromTpEmis(
  tpEmis?: string | null,
): "SVCAN" | "SVCRS" | null {
  const t = String(tpEmis ?? "").slice(0, 1);
  if (t === "6") return "SVCAN";
  if (t === "7") return "SVCRS";
  return null;
}

export function getAutorizacaoUrl(
  uf: string,
  homologation: boolean,
  tpEmis?: string | null,
): string {
  const svc = svcAuthorizerFromTpEmis(tpEmis);
  if (svc) return getSvcAutorizacaoUrl(svc, homologation);
  const u = uf.toUpperCase();
  if (u === "SP") {
    return homologation
      ? "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx"
      : "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx";
  }
  if (u === "MG") {
    return homologation
      ? "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4"
      : "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4";
  }
  if (u === "PR") {
    return homologation
      ? "https://homologacao.nfe.fazenda.pr.gov.br/nfe/NFeAutorizacao4"
      : "https://nfe.fazenda.pr.gov.br/nfe/NFeAutorizacao4";
  }
  if (u === "BA") {
    return baWebservice(homologation, "NFeAutorizacao4");
  }
  if (SVRS_STATES.has(u) || u === "MA" || u === "MS" || u === "MT") {
    return homologation
      ? "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx"
      : "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx";
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx";
}

export function getDistribuicaoDfeUrl(homologation: boolean): string {
  return homologation
    ? "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
    : "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
}

export function getRecepcaoEventoUrl(
  uf: string,
  homologation: boolean,
  tpEmis?: string | null,
): string {
  const svc = svcAuthorizerFromTpEmis(tpEmis);
  if (svc) return getSvcRecepcaoEventoUrl(svc, homologation);
  const u = uf.toUpperCase();
  if (u === "SP") {
    return homologation
      ? "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx"
      : "https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx";
  }
  if (u === "MG") {
    return homologation
      ? "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4"
      : "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4";
  }
  if (u === "PR") {
    return homologation
      ? "https://homologacao.nfe.fazenda.pr.gov.br/nfe/NFeRecepcaoEvento4"
      : "https://nfe.fazenda.pr.gov.br/nfe/NFeRecepcaoEvento4";
  }
  if (u === "BA") {
    return baWebservice(homologation, "NFeRecepcaoEvento4");
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx";
}

export function getConsultaProtocoloUrl(
  uf: string,
  homologation: boolean,
  tpEmis?: string | null,
): string {
  const svc = svcAuthorizerFromTpEmis(tpEmis);
  if (svc) return getSvcConsultaProtocoloUrl(svc, homologation);
  const u = uf.toUpperCase();
  if (u === "SP") {
    return homologation
      ? "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx"
      : "https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx";
  }
  if (u === "MG") {
    return homologation
      ? "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4"
      : "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4";
  }
  if (u === "PR") {
    return homologation
      ? "https://homologacao.nfe.fazenda.pr.gov.br/nfe/NFeConsultaProtocolo4"
      : "https://nfe.fazenda.pr.gov.br/nfe/NFeConsultaProtocolo4";
  }
  if (u === "BA") {
    return baWebservice(homologation, "NFeConsultaProtocolo4");
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx";
}

export function getInutilizacaoUrl(uf: string, homologation: boolean): string {
  const u = uf.toUpperCase();
  if (u === "SP") {
    return homologation
      ? "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx"
      : "https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx";
  }
  if (u === "MG") {
    return homologation
      ? "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4"
      : "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4";
  }
  if (u === "PR") {
    return homologation
      ? "https://homologacao.nfe.fazenda.pr.gov.br/nfe/NFeInutilizacao4"
      : "https://nfe.fazenda.pr.gov.br/nfe/NFeInutilizacao4";
  }
  if (u === "BA") {
    return baWebservice(homologation, "NFeInutilizacao4");
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx";
}

export function getSvcStatusServicoUrl(
  authorizer: "SVCAN" | "SVCRS",
  homologation: boolean,
): string {
  if (authorizer === "SVCAN") {
    return homologation
      ? "https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx"
      : "https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx";
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx";
}

export function getStatusServicoUrl(
  uf: string,
  homologation: boolean,
  tpEmis?: string | null,
): string {
  const svc = svcAuthorizerFromTpEmis(tpEmis);
  if (svc) return getSvcStatusServicoUrl(svc, homologation);
  const u = uf.toUpperCase();
  if (u === "SP") {
    return homologation
      ? "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx"
      : "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx";
  }
  if (u === "MG") {
    return homologation
      ? "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4"
      : "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4";
  }
  if (u === "PR") {
    return homologation
      ? "https://homologacao.nfe.fazenda.pr.gov.br/nfe/NFeStatusServico4"
      : "https://nfe.fazenda.pr.gov.br/nfe/NFeStatusServico4";
  }
  if (u === "BA") {
    return baWebservice(homologation, "NFeStatusServico4");
  }
  return homologation
    ? "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx"
    : "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx";
}
