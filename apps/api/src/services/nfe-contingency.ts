import { loadEstablishmentCertificate } from "../fiscal/certificate-store.js";
import {
  isSvcOperating,
  TP_EMIS_NORMAL,
  type NfeContingencyStateName,
} from "../fiscal/nfe-svc.js";
import { consultNfeStatusServico } from "../fiscal/sefaz-client.js";
import { prisma } from "../db.js";

export const CONTINGENCY_RECHECK_MS = 5 * 60 * 1000;

export async function persistContingencyState(
  establishmentId: string,
  state: NfeContingencyStateName,
): Promise<void> {
  const now = new Date();
  if (state === "SVC_ATIVA") {
    const current = await prisma.establishment.findUnique({
      where: { id: establishmentId },
      select: { nfeContingencySince: true },
    });
    await prisma.establishment.update({
      where: { id: establishmentId },
      data: {
        nfeContingencyState: "SVC_ATIVA",
        contingencyEnabled: true,
        nfeContingencyCheckedAt: now,
        nfeContingencySince: current?.nfeContingencySince ?? now,
      },
    });
    return;
  }

  await prisma.establishment.update({
    where: { id: establishmentId },
    data: {
      nfeContingencyState: state,
      contingencyEnabled: false,
      nfeContingencyCheckedAt: now,
      ...(state === "NORMAL" ? { nfeContingencySince: null } : {}),
    },
  });
}

/**
 * Se estiver em SVC, consulta o status normal. cStat 107 encerra a contingência.
 */
export async function maybeEndContingencyIfNormalIsUp(input: {
  establishmentId: string;
  uf: string;
  homologation: boolean;
  pfx: Buffer;
  password: string;
  checkedAt?: Date | null;
  state: NfeContingencyStateName;
}): Promise<NfeContingencyStateName> {
  if (input.state !== "SVC_ATIVA") return input.state;
  const stale =
    !input.checkedAt ||
    Date.now() - input.checkedAt.getTime() >= CONTINGENCY_RECHECK_MS;
  if (!stale) return input.state;

  const status = await consultNfeStatusServico({
    uf: input.uf,
    homologation: input.homologation,
    pfx: input.pfx,
    password: input.password,
    tpEmis: TP_EMIS_NORMAL,
  });
  if (isSvcOperating(status)) {
    await persistContingencyState(input.establishmentId, "NORMAL");
    return "NORMAL";
  }
  await prisma.establishment.update({
    where: { id: input.establishmentId },
    data: { nfeContingencyCheckedAt: new Date() },
  });
  return "SVC_ATIVA";
}

/** Cron: tenta encerrar SVC quando a SEFAZ da UF voltar (cStat 107). */
export async function recheckActiveContingencies(): Promise<{
  checked: number;
  ended: number;
}> {
  const ests = await prisma.establishment.findMany({
    where: { nfeContingencyState: "SVC_ATIVA", active: true },
    select: {
      id: true,
      uf: true,
      nfeEnvironment: true,
    },
  });
  let checked = 0;
  let ended = 0;
  for (const est of ests) {
    const cert = await loadEstablishmentCertificate(est.id);
    if (!cert) continue;
    checked += 1;
    const next = await maybeEndContingencyIfNormalIsUp({
      establishmentId: est.id,
      uf: est.uf ?? "SP",
      homologation: est.nfeEnvironment === "HOMOLOGATION",
      pfx: cert.pfx,
      password: cert.password,
      checkedAt: null,
      state: "SVC_ATIVA",
    });
    if (next === "NORMAL") ended += 1;
  }
  return { checked, ended };
}
