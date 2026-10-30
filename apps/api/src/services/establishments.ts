import type { Establishment, Prisma, Role } from "@prisma/client";
import { cnpjDigitsOnly, isValidCnpj } from "@pedidos/shared";
import { prisma } from "../db.js";
import { orgHasPlanFeature } from "./billing/entitlements.js";

export class EstablishmentError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "EstablishmentError";
  }
}

const publicSelect = {
  id: true,
  organizationId: true,
  legalName: true,
  tradeName: true,
  cnpj: true,
  stateRegistration: true,
  municipalRegistration: true,
  taxRegime: true,
  uf: true,
  cityIbge: true,
  street: true,
  addressNumber: true,
  complement: true,
  district: true,
  city: true,
  zipCode: true,
  nfeEnvironment: true,
  nfeSeries: true,
  nfeLastNumber: true,
  nfceSeries: true,
  nfceLastNumber: true,
  contingencyEnabled: true,
  nfeContingencyState: true,
  nfeContingencySince: true,
  nfeAdditionalInfo: true,
  autoStockOnInboundInvoice: true,
  isPrimary: true,
  active: true,
  certificateExpiresAt: true,
  certificateCnpj: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type EstablishmentPublic = Prisma.EstablishmentGetPayload<{
  select: typeof publicSelect;
}>;

function parseAllowedIds(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids;
}

/** Admin sempre todos; demais: null/omitido = todos; lista = só esses. */
export function userCanAccessEstablishment(params: {
  role: Role;
  allowedEstablishmentIds: unknown;
  establishmentId: string;
}): boolean {
  if (params.role === "ADMIN") return true;
  const allowed = parseAllowedIds(params.allowedEstablishmentIds);
  if (allowed == null) return true;
  return allowed.includes(params.establishmentId);
}

export async function listEstablishmentsForUser(params: {
  organizationId: string;
  role: Role;
  allowedEstablishmentIds: unknown;
  activeOnly?: boolean;
}): Promise<EstablishmentPublic[]> {
  const rows = await prisma.establishment.findMany({
    where: {
      organizationId: params.organizationId,
      ...(params.activeOnly === false ? {} : { active: true }),
    },
    select: publicSelect,
    orderBy: [{ isPrimary: "desc" }, { legalName: "asc" }],
  });
  if (params.role === "ADMIN") return rows;
  const allowed = parseAllowedIds(params.allowedEstablishmentIds);
  if (allowed == null) return rows;
  const set = new Set(allowed);
  return rows.filter((r) => set.has(r.id));
}

export async function getPrimaryEstablishment(
  organizationId: string,
): Promise<Establishment | null> {
  const primary = await prisma.establishment.findFirst({
    where: { organizationId, isPrimary: true },
  });
  if (primary) return primary;
  return prisma.establishment.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getEstablishmentInOrg(
  organizationId: string,
  establishmentId: string,
): Promise<Establishment | null> {
  return prisma.establishment.findFirst({
    where: { id: establishmentId, organizationId },
  });
}

/** Resolve estabelecimento ativo para criar pedido (header / body / preferência / primary). */
export async function resolveEstablishmentForOrder(params: {
  organizationId: string;
  establishmentId?: string | null;
  preferredEstablishmentId?: string | null;
  role: Role;
  allowedEstablishmentIds: unknown;
}): Promise<Establishment> {
  const candidateId =
    params.establishmentId?.trim() ||
    params.preferredEstablishmentId?.trim() ||
    null;

  if (candidateId) {
    const est = await getEstablishmentInOrg(params.organizationId, candidateId);
    if (!est || !est.active) {
      throw new EstablishmentError("Estabelecimento inválido ou inativo", 400);
    }
    if (
      !userCanAccessEstablishment({
        role: params.role,
        allowedEstablishmentIds: params.allowedEstablishmentIds,
        establishmentId: est.id,
      })
    ) {
      throw new EstablishmentError(
        "Sem permissão para este estabelecimento",
        403,
        "ESTABLISHMENT_FORBIDDEN",
      );
    }
    return est;
  }

  const primary = await getPrimaryEstablishment(params.organizationId);
  if (!primary || !primary.active) {
    throw new EstablishmentError(
      "Nenhum estabelecimento ativo na conta",
      400,
      "NO_ESTABLISHMENT",
    );
  }
  if (
    !userCanAccessEstablishment({
      role: params.role,
      allowedEstablishmentIds: params.allowedEstablishmentIds,
      establishmentId: primary.id,
    })
  ) {
    const allowed = parseAllowedIds(params.allowedEstablishmentIds);
    if (allowed?.length) {
      const first = await getEstablishmentInOrg(
        params.organizationId,
        allowed[0]!,
      );
      if (first?.active) return first;
    }
    throw new EstablishmentError(
      "Sem permissão para o estabelecimento principal",
      403,
      "ESTABLISHMENT_FORBIDDEN",
    );
  }
  return primary;
}

export function assertEstablishmentPermission(params: {
  role: Role;
  allowedEstablishmentIds: unknown;
  establishmentId: string;
}): void {
  if (
    !userCanAccessEstablishment({
      role: params.role,
      allowedEstablishmentIds: params.allowedEstablishmentIds,
      establishmentId: params.establishmentId,
    })
  ) {
    throw new EstablishmentError(
      "Sem permissão para este estabelecimento",
      403,
      "ESTABLISHMENT_FORBIDDEN",
    );
  }
}

export type CreateEstablishmentInput = {
  legalName: string;
  tradeName?: string | null;
  cnpj: string;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  taxRegime?: Establishment["taxRegime"];
  uf?: string | null;
  cityIbge?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  zipCode?: string | null;
  nfeEnvironment?: Establishment["nfeEnvironment"];
  nfeSeries?: number;
  isPrimary?: boolean;
};

export async function createEstablishment(
  organizationId: string,
  input: CreateEstablishmentInput,
): Promise<EstablishmentPublic> {
  const cnpj = cnpjDigitsOnly(input.cnpj);
  if (!isValidCnpj(cnpj)) {
    throw new EstablishmentError("CNPJ inválido", 400, "INVALID_CNPJ");
  }

  const existingCount = await prisma.establishment.count({
    where: { organizationId },
  });
  if (existingCount >= 1) {
    const canMulti = await orgHasPlanFeature(organizationId, "multi_cnpj");
    if (!canMulti) {
      throw new EstablishmentError(
        "Plano atual não inclui múltiplos CNPJ. Faça upgrade para Business.",
        403,
        "PLAN_MULTI_CNPJ",
      );
    }
  }

  const taken = await prisma.establishment.findFirst({
    where: { organizationId, cnpj },
    select: { id: true },
  });
  if (taken) {
    throw new EstablishmentError(
      "Já existe estabelecimento com este CNPJ nesta conta",
      409,
      "CNPJ_TAKEN",
    );
  }

  const makePrimary = input.isPrimary === true || existingCount === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.establishment.updateMany({
        where: { organizationId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.establishment.create({
      data: {
        organizationId,
        legalName: input.legalName.trim(),
        tradeName: input.tradeName?.trim() || null,
        cnpj,
        stateRegistration: input.stateRegistration?.trim() || null,
        municipalRegistration: input.municipalRegistration?.trim() || null,
        taxRegime: input.taxRegime ?? "SIMPLES_NACIONAL",
        uf: input.uf?.trim().toUpperCase().slice(0, 2) || null,
        cityIbge: input.cityIbge?.replace(/\D/g, "") || null,
        street: input.street?.trim() || null,
        addressNumber: input.addressNumber?.trim() || null,
        complement: input.complement?.trim() || null,
        district: input.district?.trim() || null,
        city: input.city?.trim() || null,
        zipCode: input.zipCode?.replace(/\D/g, "").slice(0, 8) || null,
        nfeEnvironment: input.nfeEnvironment ?? "HOMOLOGATION",
        nfeSeries: input.nfeSeries ?? 1,
        nfeLastNumber: 0,
        isPrimary: makePrimary,
        active: true,
      },
      select: publicSelect,
    });
  });

  return created;
}

export type UpdateEstablishmentInput = Partial<CreateEstablishmentInput> & {
  active?: boolean;
  contingencyEnabled?: boolean;
  autoStockOnInboundInvoice?: boolean;
  nfeLastNumber?: number;
  nfceSeries?: number | null;
  nfceLastNumber?: number | null;
  nfeAdditionalInfo?: string | null;
};

export async function updateEstablishment(
  organizationId: string,
  establishmentId: string,
  input: UpdateEstablishmentInput,
): Promise<EstablishmentPublic> {
  const existing = await getEstablishmentInOrg(organizationId, establishmentId);
  if (!existing) {
    throw new EstablishmentError("Estabelecimento não encontrado", 404);
  }

  let cnpj = existing.cnpj;
  if (input.cnpj !== undefined) {
    cnpj = cnpjDigitsOnly(input.cnpj);
    if (!isValidCnpj(cnpj)) {
      throw new EstablishmentError("CNPJ inválido", 400, "INVALID_CNPJ");
    }
    const taken = await prisma.establishment.findFirst({
      where: { organizationId, cnpj, id: { not: establishmentId } },
      select: { id: true },
    });
    if (taken) {
      throw new EstablishmentError(
        "Já existe estabelecimento com este CNPJ nesta conta",
        409,
        "CNPJ_TAKEN",
      );
    }
  }

  const data: Prisma.EstablishmentUpdateInput = {};
  if (input.legalName !== undefined) data.legalName = input.legalName.trim();
  if (input.tradeName !== undefined)
    data.tradeName = input.tradeName?.trim() || null;
  if (input.cnpj !== undefined) data.cnpj = cnpj;
  if (input.stateRegistration !== undefined)
    data.stateRegistration = input.stateRegistration?.trim() || null;
  if (input.municipalRegistration !== undefined)
    data.municipalRegistration = input.municipalRegistration?.trim() || null;
  if (input.taxRegime !== undefined) data.taxRegime = input.taxRegime;
  if (input.uf !== undefined)
    data.uf = input.uf?.trim().toUpperCase().slice(0, 2) || null;
  if (input.cityIbge !== undefined)
    data.cityIbge = input.cityIbge?.replace(/\D/g, "") || null;
  if (input.street !== undefined) data.street = input.street?.trim() || null;
  if (input.addressNumber !== undefined)
    data.addressNumber = input.addressNumber?.trim() || null;
  if (input.complement !== undefined)
    data.complement = input.complement?.trim() || null;
  if (input.district !== undefined)
    data.district = input.district?.trim() || null;
  if (input.city !== undefined) data.city = input.city?.trim() || null;
  if (input.zipCode !== undefined)
    data.zipCode = input.zipCode?.replace(/\D/g, "").slice(0, 8) || null;
  if (input.nfeEnvironment !== undefined)
    data.nfeEnvironment = input.nfeEnvironment;
  if (input.nfeSeries !== undefined) data.nfeSeries = input.nfeSeries;
  if (input.nfeLastNumber !== undefined)
    data.nfeLastNumber = input.nfeLastNumber;
  if (input.nfceSeries !== undefined) data.nfceSeries = input.nfceSeries;
  if (input.nfceLastNumber !== undefined)
    data.nfceLastNumber = input.nfceLastNumber;
  if (input.nfeAdditionalInfo !== undefined) {
    const t = input.nfeAdditionalInfo?.trim() || null;
    data.nfeAdditionalInfo = t ? t.slice(0, 5000) : null;
  }
  if (input.autoStockOnInboundInvoice !== undefined)
    data.autoStockOnInboundInvoice = input.autoStockOnInboundInvoice;
  if (input.active !== undefined) {
    if (input.active === false && existing.isPrimary) {
      throw new EstablishmentError(
        "Não é possível desativar o estabelecimento principal",
        400,
      );
    }
    data.active = input.active;
  }

  if (input.isPrimary === true && !existing.isPrimary) {
    return prisma.$transaction(async (tx) => {
      await tx.establishment.updateMany({
        where: { organizationId, isPrimary: true },
        data: { isPrimary: false },
      });
      return tx.establishment.update({
        where: { id: establishmentId },
        data: { ...data, isPrimary: true },
        select: publicSelect,
      });
    });
  }

  return prisma.establishment.update({
    where: { id: establishmentId },
    data,
    select: publicSelect,
  });
}

export function toSettingsPayload(est: Establishment) {
  return {
    id: est.id,
    configured: Boolean(est.cnpj?.trim()),
    legalName: est.legalName,
    tradeName: est.tradeName,
    cnpj: est.cnpj,
    stateRegistration: est.stateRegistration,
    municipalRegistration: est.municipalRegistration,
    taxRegime: est.taxRegime,
    uf: est.uf,
    cityIbge: est.cityIbge,
    street: est.street,
    addressNumber: est.addressNumber,
    complement: est.complement,
    district: est.district,
    city: est.city,
    zipCode: est.zipCode,
    nfeEnvironment: est.nfeEnvironment,
    nfeSeries: est.nfeSeries,
    nfeLastNumber: est.nfeLastNumber,
    nfceSeries: est.nfceSeries,
    nfceLastNumber: est.nfceLastNumber,
    contingencyEnabled: est.contingencyEnabled,
    nfeContingencyState: est.nfeContingencyState,
    nfeContingencySince: est.nfeContingencySince,
    nfeAdditionalInfo: est.nfeAdditionalInfo,
    autoStockOnInboundInvoice: est.autoStockOnInboundInvoice,
    isPrimary: est.isPrimary,
    active: est.active,
    logo: {
      uploaded: Boolean(est.danfeLogoBytes?.length),
      mimeType: est.danfeLogoMimeType,
    },
  };
}
