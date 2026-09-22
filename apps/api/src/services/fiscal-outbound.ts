import type { Establishment } from "@prisma/client";
import { prisma } from "../db.js";
import { loadEstablishmentCertificate } from "../fiscal/certificate-store.js";
import {
  getPrimaryEstablishment,
} from "./establishments.js";
import {
  customerFiscalDocument,
  customerFiscalRecipientSnapshot,
} from "../fiscal/customer-fiscal.js";
import {
  buildCancelamentoEvento,
  buildCartaCorrecaoEvento,
  buildInutilizacao,
  wrapEnvEvento,
  wrapInutNFe,
} from "../fiscal/nfe-event-xml.js";
import {
  signInfEvento,
  signInfInut,
  signInfNFe,
} from "../fiscal/nfe-signer.js";
import {
  buildSignedNfePackage,
  normalizeNfeNature,
  wrapEnviNFe,
} from "../fiscal/nfe-xml-builder.js";
import {
  authorizeNfe,
  consultNfeProtocolo,
  sendNfeEvento,
  sendNfeInutilizacao,
} from "../fiscal/sefaz-client.js";
import { rebuildAccessKeyWithTpEmis } from "../fiscal/nfe-access-key.js";
import {
  isSvcTpEmis,
  normalizeSvcJustification,
  shouldFallbackToSvc,
  svcForUf,
} from "../fiscal/nfe-svc.js";
import { validateProductFiscalAgainstCatalog } from "../fiscal/fiscal-catalog-validation.js";
import { explainSefazRejection } from "../fiscal/sefaz-rejection-hints.js";
import {
  computeItemTaxes,
  validateCustomerFiscal,
  validateOrganizationFiscalConfig,
  validateOrganizationFiscalConfigForEmit,
  validateProductFiscal,
} from "../fiscal/validation.js";


async function resolveEmitenteForOrg(
  organizationId: string,
  establishmentId?: string | null,
): Promise<Establishment | null> {
  if (establishmentId) {
    const est = await prisma.establishment.findFirst({
      where: { id: establishmentId, organizationId },
    });
    if (est) return est;
  }
  return getPrimaryEstablishment(organizationId);
}

async function resolveEmitenteForInvoice(invoice: {
  organizationId: string;
  establishmentId: string | null;
  orderId: string | null;
}): Promise<Establishment | null> {
  if (invoice.establishmentId) {
    return resolveEmitenteForOrg(invoice.organizationId, invoice.establishmentId);
  }
  if (invoice.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: invoice.orderId, organizationId: invoice.organizationId },
      select: { establishmentId: true },
    });
    if (order?.establishmentId) {
      return resolveEmitenteForOrg(invoice.organizationId, order.establishmentId);
    }
  }
  return getPrimaryEstablishment(invoice.organizationId);
}

export async function buildOutboundInvoiceFromOrder(
  organizationId: string,
  orderId: string,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId, status: "CONFIRMED" },
    include: {
      customer: true,
      establishment: true,
      items: {
        include: {
          product: { include: { fiscalNcm: true, outboundOperation: true } },
        },
      },
      fiscalInvoices: {
        where: { direction: "OUTBOUND", status: "AUTHORIZED" },
        take: 1,
      },
    },
  });

  if (!order)
    return {
      ok: false as const,
      issues: [
        { code: "ORDER", message: "Pedido não encontrado ou não confirmado" },
      ],
    };
  if (!order.customer) {
    return {
      ok: false as const,
      issues: [{ code: "NO_CUSTOMER", message: "Pedido sem cliente" }],
    };
  }
  if (order.fiscalInvoices.length > 0) {
    return {
      ok: false as const,
      issues: [
        {
          code: "ALREADY_INVOICED",
          message: "Pedido já possui NF-e autorizada",
        },
      ],
    };
  }

  const config = order.establishment;
  const orgIssues = validateOrganizationFiscalConfigForEmit(config);
  if (orgIssues.length) {
    return { ok: false as const, issues: orgIssues };
  }

  const cfg = config!;
  const regime = cfg.taxRegime;

  const catalogIssues = (
    await Promise.all(
      order.items.map((i) =>
        validateProductFiscalAgainstCatalog(i.product, {
          regime,
          operationKind: "OUTBOUND",
        }),
      ),
    )
  ).flat();

  // Tenta preencher IBGE pendente antes de validar emissão.
  if (order.customerId && order.customer) {
    const { ensureCustomerCityIbge } = await import(
      "./ibge/municipio-resolver.js"
    );
    const ensured = await ensureCustomerCityIbge({
      organizationId,
      customerId: order.customerId,
    });
    if (ensured.ok && ensured.cityIbgeCode) {
      order.customer.cityIbgeCode = ensured.cityIbgeCode;
    }
  }

  const issues = [
    ...validateCustomerFiscal(order.customer),
    ...order.items.flatMap((i) => validateProductFiscal(i.product)),
    ...catalogIssues,
  ];
  if (issues.length) return { ok: false as const, issues };

  const nextNumber = cfg.nfeLastNumber + 1;

  const invoiceItems = order.items.map((item, idx) => {
    const ncm = item.product.fiscalNcm;
    const op = item.product.outboundOperation;
    const cfop = op?.cfop ?? "5102";
    const orig = item.product.fiscalOrigin ?? item.product.nfeOrigin;
    if (orig == null) {
      throw new Error(
        `Produto "${item.product.name}" sem origem fiscal (0–8).`,
      );
    }
    const taxes = computeItemTaxes({
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      icmsRate: ncm?.icmsRate ? Number(ncm.icmsRate) : undefined,
      pisRate: ncm?.pisRate ? Number(ncm.pisRate) : undefined,
      cofinsRate: ncm?.cofinsRate ? Number(ncm.cofinsRate) : undefined,
      ipiRate: item.product.ipiPercent
        ? Number(item.product.ipiPercent)
        : undefined,
      fcpRate: ncm?.fcpRate ? Number(ncm.fcpRate) : undefined,
      cstPis: item.product.cstPis,
      regime,
    });
    return {
      lineNumber: idx + 1,
      productId: item.productId,
      description: item.product.fiscalDescription ?? item.productName,
      ncm: ncm?.code ?? item.product.ncm ?? null,
      cfop,
      unit: item.product.fiscalUnit ?? item.product.purchaseUnit ?? "UN",
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: item.quantity * Number(item.unitPrice),
      taxSnapshot: {
        ...taxes,
        orig,
        csosn:
          item.product.fiscalCsosn ?? ncm?.defaultCsosn ?? taxes.csosn,
        cst:
          item.product.fiscalCstIcms ?? ncm?.defaultCstIcms ?? taxes.cst,
        cProd: item.product.sku ?? item.product.barcode ?? item.productId,
        gtin: item.product.fiscalGtin ?? item.product.barcode ?? null,
        cest: item.product.fiscalCest ?? ncm?.cest ?? null,
        ncmException: item.product.ncmException ?? null,
        natOp: normalizeNfeNature(op?.nature || op?.description),
      },
      _grossWeightKg: item.product.grossWeightKg
        ? Number(item.product.grossWeightKg) * item.quantity
        : 0,
      _netWeightKg: item.product.netWeightKg
        ? Number(item.product.netWeightKg) * item.quantity
        : 0,
    };
  });

  const totalAmount = invoiceItems.reduce((s, i) => s + i.totalPrice, 0);
  const grossWeightKg = invoiceItems.reduce((s, i) => s + i._grossWeightKg, 0);
  const netWeightKg = invoiceItems.reduce((s, i) => s + i._netWeightKg, 0);
  const volumeQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const nature = resolveInvoiceNature(invoiceItems);

  const invoice = await prisma.$transaction(async (tx) => {
    await tx.establishment.update({
      where: { id: cfg.id },
      data: { nfeLastNumber: nextNumber },
    });

    return tx.fiscalInvoice.create({
      data: {
        organizationId,
        establishmentId: cfg.id,
        direction: "OUTBOUND",
        status: "DRAFT",
        documentModel: 55,
        tpEmis: "1",
        modFrete: "9",
        volumeQty: volumeQty > 0 ? volumeQty : null,
        grossWeightKg: grossWeightKg > 0 ? grossWeightKg : null,
        netWeightKg: netWeightKg > 0 ? netWeightKg : null,
        orderId: order.id,
        customerId: order.customerId,
        number: nextNumber,
        series: cfg.nfeSeries,
        totalAmount,
        issuerSnapshot: buildIssuerSnapshot(cfg, nature),
        recipientSnapshot: buildRecipientSnapshot(order.customer!),
        items: {
          create: invoiceItems.map(
            ({ _grossWeightKg: _g, _netWeightKg: _n, ...row }) => row,
          ),
        },
      },
      include: { items: true, order: { include: { customer: true } } },
    });
  });

  return { ok: true as const, invoice };
}

export async function transmitOutboundInvoice(
  organizationId: string,
  invoiceId: string,
) {
  const invoice = await prisma.fiscalInvoice.findFirst({
    where: { id: invoiceId, organizationId, direction: "OUTBOUND" },
    include: {
      items: true,
      order: {
        include: {
          customer: true,
          paymentCondition: { select: { days: true, name: true, code: true } },
        },
      },
    },
  });
  if (!invoice) return { ok: false as const, error: "Nota não encontrada" };
  if (invoice.status !== "DRAFT" && invoice.status !== "REJECTED") {
    return { ok: false as const, error: "Status inválido para transmissão" };
  }

  const config = await resolveEmitenteForInvoice(invoice);
  const issues = validateOrganizationFiscalConfig(config);
  if (issues.length)
    return {
      ok: false as const,
      error: issues.map((i) => i.message).join("; "),
    };

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, displayName: true },
  });
  const cert = await loadEstablishmentCertificate(config!.id);
  if (!cert)
    return { ok: false as const, error: "Certificado A1 não disponível" };

  const recipient =
    (invoice.recipientSnapshot as ReturnType<
      typeof buildRecipientSnapshot
    > | null) ??
    (invoice.order?.customer
      ? buildRecipientSnapshot(invoice.order.customer)
      : null);
  if (!recipient)
    return { ok: false as const, error: "Destinatário não encontrado na nota" };

  const nature = await resolveNatureForInvoice(organizationId, invoice);
  const homolog = config!.nfeEnvironment === "HOMOLOGATION";
  const uf = config!.uf ?? "SP";
  const svc = svcForUf(uf);
  const alreadySvc = isSvcTpEmis(invoice.tpEmis);
  const forceSvc = Boolean(config!.contingencyEnabled) && !alreadySvc;
  const startTpEmis = alreadySvc
    ? String(invoice.tpEmis).slice(0, 1)
    : forceSvc
      ? svc.tpEmis
      : "1";
  const startJustification = isSvcTpEmis(startTpEmis)
    ? normalizeSvcJustification(
        invoice.contingencyJustification ??
          (forceSvc
            ? "Emissao forcada em contingencia SVC pelo emitente"
            : null),
      )
    : null;

  const workingInvoice = {
    ...invoice,
    tpEmis: startTpEmis,
    contingencyJustification: startJustification,
  };

  const packageOpts = {
    config: config!,
    recipient,
    emitterName:
      config!.legalName?.trim() ||
      config!.tradeName?.trim() ||
      org?.displayName?.trim() ||
      org?.name ||
      "Emitente",
    payment: {
      days: invoice.order?.paymentCondition?.days ?? 0,
    },
    nature,
  };

  const firstPkg = buildSignedNfePackage({
    ...packageOpts,
    invoice: workingInvoice,
  });
  let accessKey = firstPkg.accessKey;
  let issuedAt = firstPkg.issuedAt;
  let tpEmis = startTpEmis;
  let justification = startJustification;
  let signedNFe = signInfNFe(
    firstPkg.infNFeXml,
    cert.privateKeyPem,
    cert.certPem,
  );
  let enviNFe = wrapEnviNFe(signedNFe);

  let sefaz = await authorizeNfe({
    uf,
    homologation: homolog,
    enviNFeXml: enviNFe,
    pfx: cert.pfx,
    password: cert.password,
    tpEmis,
  });

  const usedSvcFallback =
    !alreadySvc &&
    !forceSvc &&
    !isSvcTpEmis(tpEmis) &&
    shouldFallbackToSvc(sefaz);

  if (usedSvcFallback) {
    await prisma.fiscalInvoiceEvent.create({
      data: {
        fiscalInvoiceId: invoice.id,
        eventType: "NFeAutorizacao",
        requestPayload: enviNFe.slice(0, 50000),
        responsePayload: (sefaz.rawResponse || sefaz.error || "").slice(
          0,
          50000,
        ),
        success: false,
      },
    });

    justification = normalizeSvcJustification(
      invoice.contingencyJustification ??
        `SEFAZ ${uf} indisponivel - emissao em ${svc.label}`,
    );
    tpEmis = svc.tpEmis;
    accessKey = rebuildAccessKeyWithTpEmis(accessKey, tpEmis);
    const svcInvoice = {
      ...workingInvoice,
      tpEmis,
      contingencyJustification: justification,
    };
    const svcPkg = buildSignedNfePackage({
      ...packageOpts,
      invoice: svcInvoice,
      accessKey,
      issuedAt,
    });
    signedNFe = signInfNFe(svcPkg.infNFeXml, cert.privateKeyPem, cert.certPem);
    enviNFe = wrapEnviNFe(signedNFe);
    sefaz = await authorizeNfe({
      uf,
      homologation: homolog,
      enviNFeXml: enviNFe,
      pfx: cert.pfx,
      password: cert.password,
      tpEmis,
    });
  }

  const issuerSnapshot = {
    ...(typeof invoice.issuerSnapshot === "object" &&
    invoice.issuerSnapshot != null
      ? (invoice.issuerSnapshot as Record<string, string | null | undefined>)
      : {}),
    ...buildIssuerSnapshot(config!, nature),
    ...(isSvcTpEmis(tpEmis)
      ? {
          tpEmis,
          svcAuthorizer: svc.authorizer,
          contingencyJustification: justification,
        }
      : {}),
  };

  const eventType =
    usedSvcFallback || isSvcTpEmis(tpEmis)
      ? "NFeAutorizacaoSVC"
      : "NFeAutorizacao";

  const updated = await prisma.$transaction(async (tx) => {
    await tx.fiscalInvoiceEvent.create({
      data: {
        fiscalInvoiceId: invoice.id,
        eventType,
        requestPayload: enviNFe.slice(0, 50000),
        responsePayload: (sefaz.rawResponse || sefaz.error || "").slice(
          0,
          50000,
        ),
        success: sefaz.ok || Boolean(sefaz.pending),
      },
    });

    const common = {
      tpEmis,
      contingencyJustification: justification,
      accessKey: sefaz.parsed.chNFe ?? accessKey,
      xmlSigned: signedNFe,
      issuedAt,
      issuerSnapshot,
    };

    if (sefaz.ok) {
      return tx.fiscalInvoice.update({
        where: { id: invoice.id },
        data: {
          ...common,
          status: "AUTHORIZED",
          xmlAuthorized: sefaz.rawResponse || signedNFe,
          protocol: sefaz.parsed.nProt ?? null,
          rejectionReason: null,
        },
        include: { items: true, order: true },
      });
    }

    if (sefaz.pending) {
      return tx.fiscalInvoice.update({
        where: { id: invoice.id },
        data: {
          ...common,
          status: "TRANSMITTED",
          rejectionReason: null,
        },
        include: { items: true, order: true },
      });
    }

    const rejectionExplained = explainSefazRejection(
      sefaz.error ?? sefaz.parsed.xMotivo,
      sefaz.parsed.cStat,
    );

    return tx.fiscalInvoice.update({
      where: { id: invoice.id },
      data: {
        ...common,
        status: "REJECTED",
        rejectionReason: rejectionExplained.userMessage,
      },
      include: { items: true, order: true },
    });
  });

  if (sefaz.pending) {
    return {
      ok: true as const,
      pending: true as const,
      sefazReceipt: sefaz.parsed.nRec ?? null,
      invoice: updated,
    };
  }

  if (!sefaz.ok) {
    const rejectionExplained = explainSefazRejection(
      sefaz.error ?? updated.rejectionReason,
      sefaz.parsed.cStat,
    );
    return {
      ok: false as const,
      error: rejectionExplained.userMessage,
      rejection: rejectionExplained,
      invoice: updated,
    };
  }

  return { ok: true as const, invoice: updated };
}

export async function updateOutboundInvoiceTransport(
  organizationId: string,
  invoiceId: string,
  data: {
    modFrete?: string;
    freightAmount?: number | null;
    volumeQty?: number | null;
    grossWeightKg?: number | null;
    netWeightKg?: number | null;
  },
) {
  const invoice = await prisma.fiscalInvoice.findFirst({
    where: { id: invoiceId, organizationId, direction: "OUTBOUND" },
  });
  if (!invoice) return { ok: false as const, error: "Nota não encontrada" };
  if (invoice.status !== "DRAFT" && invoice.status !== "REJECTED") {
    return {
      ok: false as const,
      error: "Só é possível editar transporte em rascunho ou rejeitada",
    };
  }
  const updated = await prisma.fiscalInvoice.update({
    where: { id: invoiceId },
    data: {
      ...(data.modFrete != null
        ? { modFrete: String(data.modFrete).slice(0, 1) }
        : {}),
      ...(data.freightAmount !== undefined
        ? { freightAmount: data.freightAmount }
        : {}),
      ...(data.volumeQty !== undefined ? { volumeQty: data.volumeQty } : {}),
      ...(data.grossWeightKg !== undefined
        ? { grossWeightKg: data.grossWeightKg }
        : {}),
      ...(data.netWeightKg !== undefined
        ? { netWeightKg: data.netWeightKg }
        : {}),
    },
    include: { items: true, order: { include: { customer: true } } },
  });
  return { ok: true as const, invoice: updated };
}

export async function cancelOutboundInvoice(
  organizationId: string,
  invoiceId: string,
  justification: string,
) {
  const invoice = await prisma.fiscalInvoice.findFirst({
    where: { id: invoiceId, organizationId, direction: "OUTBOUND" },
  });
  if (!invoice) return { ok: false as const, error: "Nota não encontrada" };
  if (invoice.status !== "AUTHORIZED") {
    return {
      ok: false as const,
      error: "Somente NF-e autorizada pode ser cancelada",
    };
  }
  if (!invoice.accessKey || !invoice.protocol) {
    return { ok: false as const, error: "Chave ou protocolo ausentes" };
  }
  if (justification.trim().length < 15) {
    return {
      ok: false as const,
      error: "Justificativa deve ter no mínimo 15 caracteres",
    };
  }

  const config = await resolveEmitenteForInvoice(invoice);
  const issues = validateOrganizationFiscalConfig(config);
  if (issues.length)
    return {
      ok: false as const,
      error: issues.map((i) => i.message).join("; "),
    };

  const cert = await loadEstablishmentCertificate(config!.id);
  if (!cert)
    return { ok: false as const, error: "Certificado A1 não disponível" };

  const homolog = config!.nfeEnvironment === "HOMOLOGATION";
  const { infEvento } = buildCancelamentoEvento({
    accessKey: invoice.accessKey,
    cnpj: config!.cnpj ?? "",
    uf: config!.uf ?? "SP",
    homologation: homolog,
    protocol: invoice.protocol,
    justification,
    tpEmis: invoice.tpEmis,
  });
  const signedEvento = signInfEvento(
    infEvento,
    cert.privateKeyPem,
    cert.certPem,
  );
  const envEvento = wrapEnvEvento(signedEvento);

  const sefaz = await sendNfeEvento({
    uf: config!.uf ?? "SP",
    homologation: homolog,
    envEventoXml: envEvento,
    pfx: cert.pfx,
    password: cert.password,
    tpEmis: invoice.tpEmis,
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.fiscalInvoiceEvent.create({
      data: {
        fiscalInvoiceId: invoice.id,
        eventType: "NFeCancelamento",
        requestPayload: envEvento.slice(0, 50000),
        responsePayload: (sefaz.rawResponse || sefaz.error || "").slice(
          0,
          50000,
        ),
        success: sefaz.ok,
      },
    });

    if (!sefaz.ok) {
      return tx.fiscalInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { items: true, order: true },
      });
    }

    return tx.fiscalInvoice.update({
      where: { id: invoice.id },
      data: { status: "CANCELLED", rejectionReason: justification.trim() },
      include: { items: true, order: true },
    });
  });

  if (!sefaz.ok) {
    return {
      ok: false as const,
      error: sefaz.error ?? "Cancelamento rejeitado pela SEFAZ",
      invoice: updated,
    };
  }

  return { ok: true as const, invoice: updated };
}

export async function sendCartaCorrecao(
  organizationId: string,
  invoiceId: string,
  correctionText: string,
) {
  const invoice = await prisma.fiscalInvoice.findFirst({
    where: { id: invoiceId, organizationId, direction: "OUTBOUND" },
    include: { events: true },
  });
  if (!invoice) return { ok: false as const, error: "Nota não encontrada" };
  if (invoice.status !== "AUTHORIZED") {
    return {
      ok: false as const,
      error: "Somente NF-e autorizada pode receber CC-e",
    };
  }
  if (!invoice.accessKey) {
    return { ok: false as const, error: "Chave de acesso ausente" };
  }

  const config = await resolveEmitenteForInvoice(invoice);
  const issues = validateOrganizationFiscalConfig(config);
  if (issues.length) {
    return {
      ok: false as const,
      error: issues.map((i) => i.message).join("; "),
    };
  }

  const cert = await loadEstablishmentCertificate(config!.id);
  if (!cert)
    return { ok: false as const, error: "Certificado A1 não disponível" };

  const prevCce = invoice.events.filter(
    (e) => e.eventType === "NFeCartaCorrecao" && e.success,
  ).length;
  const seqEvento = prevCce + 1;
  const homolog = config!.nfeEnvironment === "HOMOLOGATION";

  let built: ReturnType<typeof buildCartaCorrecaoEvento>;
  try {
    built = buildCartaCorrecaoEvento({
      accessKey: invoice.accessKey,
      cnpj: config!.cnpj ?? "",
      uf: config!.uf ?? "SP",
      homologation: homolog,
      correctionText,
      seqEvento,
      tpEmis: invoice.tpEmis,
    });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Texto da CC-e inválido",
    };
  }

  const signedEvento = signInfEvento(
    built.infEvento,
    cert.privateKeyPem,
    cert.certPem,
  );
  const envEvento = wrapEnvEvento(signedEvento, built.idLote);
  const sefaz = await sendNfeEvento({
    uf: config!.uf ?? "SP",
    homologation: homolog,
    envEventoXml: envEvento,
    pfx: cert.pfx,
    password: cert.password,
    tpEmis: invoice.tpEmis,
  });

  await prisma.fiscalInvoiceEvent.create({
    data: {
      fiscalInvoiceId: invoice.id,
      eventType: "NFeCartaCorrecao",
      requestPayload: envEvento.slice(0, 50000),
      responsePayload: (sefaz.rawResponse || sefaz.error || "").slice(0, 50000),
      success: sefaz.ok,
    },
  });

  if (!sefaz.ok) {
    return {
      ok: false as const,
      error: sefaz.error ?? "CC-e rejeitada pela SEFAZ",
    };
  }
  return { ok: true as const, nSeqEvento: seqEvento };
}

export async function consultOutboundInvoiceSituation(
  organizationId: string,
  invoiceId: string,
) {
  const invoice = await prisma.fiscalInvoice.findFirst({
    where: { id: invoiceId, organizationId, direction: "OUTBOUND" },
  });
  if (!invoice) return { ok: false as const, error: "Nota não encontrada" };
  if (!invoice.accessKey) {
    return { ok: false as const, error: "Chave de acesso ausente" };
  }

  const config = await resolveEmitenteForInvoice(invoice);
  const cert = config ? await loadEstablishmentCertificate(config.id) : null;
  if (!config || !cert) {
    return {
      ok: false as const,
      error: "Configuração/certificado indisponível",
    };
  }

  const homolog = config.nfeEnvironment === "HOMOLOGATION";
  const sefaz = await consultNfeProtocolo({
    uf: config.uf ?? "SP",
    homologation: homolog,
    accessKey: invoice.accessKey,
    pfx: cert.pfx,
    password: cert.password,
    tpEmis: invoice.tpEmis,
  });

  await prisma.fiscalInvoiceEvent.create({
    data: {
      fiscalInvoiceId: invoice.id,
      eventType: "NFeConsultaSituacao",
      requestPayload: invoice.accessKey,
      responsePayload: (sefaz.rawResponse || sefaz.error || "").slice(0, 50000),
      success: sefaz.ok,
    },
  });

  // Sincroniza status local a partir da consulta
  if (sefaz.ok && sefaz.parsed.cStat === "100") {
    if (invoice.status === "TRANSMITTED" || invoice.status === "DRAFT") {
      await prisma.fiscalInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "AUTHORIZED",
          protocol: sefaz.parsed.nProt ?? invoice.protocol,
          rejectionReason: null,
          xmlAuthorized: invoice.xmlAuthorized ?? invoice.xmlSigned,
        },
      });
    }
  } else if (
    sefaz.ok &&
    sefaz.parsed.cStat === "101" &&
    invoice.status === "AUTHORIZED"
  ) {
    await prisma.fiscalInvoice.update({
      where: { id: invoice.id },
      data: { status: "CANCELLED" },
    });
  }

  return {
    ok: sefaz.ok,
    error: sefaz.error,
    cStat: sefaz.parsed.cStat,
    xMotivo: sefaz.parsed.xMotivo,
    nProt: sefaz.parsed.nProt,
  };
}

export async function inutilizarNumeracao(input: {
  organizationId: string;
  numberStart: number;
  numberEnd: number;
  justification: string;
  series?: number;
  year?: number;
  establishmentId?: string;
}) {
  const config = await resolveEmitenteForOrg(
    input.organizationId,
    input.establishmentId,
  );
  const issues = validateOrganizationFiscalConfig(config);
  if (issues.length) {
    return {
      ok: false as const,
      error: issues.map((i) => i.message).join("; "),
    };
  }
  if (input.numberEnd < input.numberStart) {
    return { ok: false as const, error: "Número final menor que o inicial" };
  }

  const cert = await loadEstablishmentCertificate(config!.id);
  if (!cert)
    return { ok: false as const, error: "Certificado A1 não disponível" };

  const series = input.series ?? config!.nfeSeries;
  const year = input.year ?? new Date().getFullYear();
  const homolog = config!.nfeEnvironment === "HOMOLOGATION";

  let built: ReturnType<typeof buildInutilizacao>;
  try {
    built = buildInutilizacao({
      cnpj: config!.cnpj ?? "",
      uf: config!.uf ?? "SP",
      homologation: homolog,
      year,
      series,
      numberStart: input.numberStart,
      numberEnd: input.numberEnd,
      justification: input.justification,
    });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Dados inválidos",
    };
  }

  const signed = signInfInut(built.infInut, cert.privateKeyPem, cert.certPem);
  const inutXml = wrapInutNFe(signed);
  const sefaz = await sendNfeInutilizacao({
    uf: config!.uf ?? "SP",
    homologation: homolog,
    inutNFeXml: inutXml,
    pfx: cert.pfx,
    password: cert.password,
  });

  // Evento órfão ligado a uma nota placeholder não existe — grava em auditoria via caller.
  // Criamos um FiscalInvoiceEvent só se houver invoice; aqui retornamos payload para log.
  return {
    ok: sefaz.ok,
    error: sefaz.error,
    cStat: sefaz.parsed.cStat,
    xMotivo: sefaz.parsed.xMotivo,
    requestXml: inutXml.slice(0, 50000),
    responseXml: (sefaz.rawResponse || "").slice(0, 50000),
  };
}

function buildIssuerSnapshot(
  cfg: Establishment,
  nature?: string | null,
) {
  return {
    cnpj: cfg.cnpj,
    ie: cfg.stateRegistration,
    uf: cfg.uf,
    city: cfg.city,
    street: cfg.street,
    number: cfg.addressNumber,
    legalName: cfg.legalName,
    tradeName: cfg.tradeName,
    establishmentId: cfg.id,
    nature: normalizeNfeNature(nature),
  };
}

function resolveInvoiceNature(items: { taxSnapshot?: unknown }[]): string {
  for (const item of items) {
    const snap = item.taxSnapshot as { natOp?: string } | null;
    if (snap?.natOp?.trim()) return normalizeNfeNature(snap.natOp);
  }
  return normalizeNfeNature(null);
}

async function resolveNatureForInvoice(
  organizationId: string,
  invoice: {
    issuerSnapshot?: unknown;
    items: { cfop?: string | null; taxSnapshot?: unknown }[];
  },
): Promise<string> {
  const snap = invoice.issuerSnapshot as { nature?: string } | null;
  if (snap?.nature?.trim()) return normalizeNfeNature(snap.nature);

  const fromItems = resolveInvoiceNature(invoice.items);
  if (fromItems !== "VENDA DE MERCADORIA") return fromItems;

  const cfop = invoice.items.find((i) => i.cfop?.trim())?.cfop?.trim();
  if (!cfop) return normalizeNfeNature(null);

  const op = await prisma.fiscalOperation.findFirst({
    where: {
      organizationId,
      direction: "OUTBOUND",
      cfop,
      active: true,
    },
    select: { nature: true, description: true },
  });
  return normalizeNfeNature(op?.nature || op?.description);
}

function buildRecipientSnapshot(
  customer: Parameters<typeof customerFiscalRecipientSnapshot>[0],
) {
  return customerFiscalRecipientSnapshot(customer);
}

export async function listEligibleOutboundOrders(organizationId: string) {
  const orders = await prisma.order.findMany({
    where: { organizationId, status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      establishment: {
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          cnpj: true,
          uf: true,
          certificatePfxEncrypted: true,
          certificateExpiresAt: true,
          taxRegime: true,
          stateRegistration: true,
          city: true,
          street: true,
          addressNumber: true,
          nfeEnvironment: true,
          nfeSeries: true,
          nfeLastNumber: true,
          contingencyEnabled: true,
        },
      },
      seller: { include: { user: { select: { name: true } } } },
      items: { include: { product: true } },
      fiscalInvoices: {
        where: { direction: "OUTBOUND" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          accessKey: true,
          number: true,
          series: true,
        },
      },
    },
  });

  const { ensureCustomerCityIbge } = await import(
    "./ibge/municipio-resolver.js"
  );

  // Tenta preencher IBGE pendente (cache por UF/CEP evita N chamadas).
  for (const o of orders) {
    const ibge = o.customer?.cityIbgeCode?.replace(/\D/g, "") ?? "";
    if (o.customer && (!ibge || ibge.length !== 7)) {
      const ensured = await ensureCustomerCityIbge({
        organizationId,
        customerId: o.customer.id,
      });
      if (ensured.ok && ensured.cityIbgeCode) {
        o.customer.cityIbgeCode = ensured.cityIbgeCode;
      }
    }
  }

  return orders.map((o) => {
    const orgIssues = validateOrganizationFiscalConfigForEmit(o.establishment);
    const customerIssues = o.customer
      ? validateCustomerFiscal(o.customer)
      : [{ code: "NO_CUSTOMER", message: "Pedido sem cliente" }];
    const productIssues = o.items.flatMap((i) =>
      validateProductFiscal(i.product),
    );
    const readinessIssues = [...orgIssues, ...customerIssues, ...productIssues];

    return {
      ...o,
      customer: o.customer
        ? {
            id: o.customer.id,
            name: o.customer.name,
            document: customerFiscalDocument(o.customer),
          }
        : null,
      fiscalStatus: (o.fiscalInvoices[0]?.status ?? "NONE") as
        | import("@prisma/client").FiscalInvoiceStatus
        | "NONE",
      fiscalInvoice: o.fiscalInvoices[0] ?? null,
      readinessIssues,
      canEmit: readinessIssues.length === 0 && !o.fiscalInvoices[0],
    };
  });
}
