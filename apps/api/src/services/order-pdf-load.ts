import type { FastifyReply } from "fastify";
import type { Prisma } from "@prisma/client";
import {
  formatCnpjMask,
  formatStructuredAddress,
  paymentConditionLabel,
} from "@pedidos/shared";
import { prisma } from "../db.js";
import {
  buildOrderPdf,
  orderPdfFilename,
  type OrderPdfCustomer,
  type OrderPdfInput,
  type OrderPdfOrganization,
  type OrderPdfPaymentCondition,
} from "./order-pdf.js";
import {
  buildOrderPdf80mm,
  orderPdf80mmFilename,
} from "./order-pdf-80mm.js";
import { resolveOrderPdfLogo } from "./order-pdf-logo.js";

const orderPdfInclude = {
  seller: { include: { user: { select: { name: true, email: true, phone: true } } } },
  customer: {
    select: {
      name: true,
      email: true,
      phone: true,
      legalName: true,
      tradeName: true,
      documentType: true,
      cnpj: true,
      cpf: true,
      street: true,
      number: true,
      neighborhood: true,
      city: true,
      state: true,
      cep: true,
      addressNote: true,
      stateRegistration: true,
      buyerName: true,
    },
  },
  paymentCondition: {
    select: { id: true, name: true, days: true, sortOrder: true },
  },
  items: {
    include: {
      product: {
        select: {
          sku: true,
          barcode: true,
          purchaseUnit: true,
          grossWeightKg: true,
          netWeightKg: true,
          basePrice: true,
        },
      },
    },
  },
  establishment: {
    select: {
      legalName: true,
      tradeName: true,
      cnpj: true,
      stateRegistration: true,
      street: true,
      addressNumber: true,
      complement: true,
      district: true,
      city: true,
      zipCode: true,
      uf: true,
    },
  },
  organization: {
    select: {
      name: true,
      displayName: true,
      logoUrl: true,
      cnpj: true,
      document: true,
      stateRegistration: true,
    },
  },
} as const;

export async function loadOrderForPdf(where: Prisma.OrderWhereInput) {
  return prisma.order.findFirst({
    where,
    include: orderPdfInclude,
  });
}

function toCustomer(
  customer: NonNullable<Awaited<ReturnType<typeof loadOrderForPdf>>>["customer"],
): OrderPdfCustomer | null {
  if (!customer) return null;
  return {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    legalName: customer.legalName,
    tradeName: customer.tradeName,
    documentType: customer.documentType,
    cnpj: customer.cnpj,
    cpf: customer.cpf,
    street: customer.street,
    number: customer.number,
    neighborhood: customer.neighborhood,
    city: customer.city,
    state: customer.state,
    cep: customer.cep,
    addressNote: customer.addressNote,
    stateRegistration: customer.stateRegistration,
    buyerName: customer.buyerName,
  };
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function formatOrgCnpj(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  if (d.length === 14) return formatCnpjMask(d);
  const trimmed = raw?.trim();
  return trimmed || null;
}

function toOrganization(
  org: NonNullable<Awaited<ReturnType<typeof loadOrderForPdf>>>["organization"],
  fiscal: NonNullable<
    Awaited<ReturnType<typeof loadOrderForPdf>>
  >["establishment"] | null,
): OrderPdfOrganization {
  const name =
    (fiscal?.tradeName?.trim() ||
      fiscal?.legalName?.trim() ||
      org.displayName?.trim() ||
      org.name
    ).trim() || "—";
  const cnpj =
    formatOrgCnpj(fiscal?.cnpj) ??
    formatOrgCnpj(org.cnpj) ??
    formatOrgCnpj(org.document);
  const stateRegistration =
    fiscal?.stateRegistration?.trim() ||
    org.stateRegistration?.trim() ||
    null;

  const address =
    formatStructuredAddress({
      street: fiscal?.street,
      number: fiscal?.addressNumber,
      neighborhood: fiscal?.district,
      city: fiscal?.city,
      state: fiscal?.uf,
      cep: fiscal?.zipCode,
    }) ?? null;

  const complement = fiscal?.complement?.trim() || null;

  return {
    name,
    cnpj,
    stateRegistration,
    address,
    complement,
  };
}

function toPaymentCondition(
  pc: NonNullable<
    Awaited<ReturnType<typeof loadOrderForPdf>>
  >["paymentCondition"],
): OrderPdfPaymentCondition | null {
  if (!pc) return null;
  return {
    name: pc.name,
    days: pc.days,
    label: paymentConditionLabel(pc),
  };
}

export async function orderToPdfInput(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForPdf>>>,
): Promise<OrderPdfInput> {
  const logo = await resolveOrderPdfLogo({
    organizationId: order.organizationId,
    logoUrl: order.organization.logoUrl,
  });

  const organization = toOrganization(
    order.organization,
    order.establishment,
  );

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    comboDiscountTotal: order.comboDiscountTotal,
    notes: order.notes,
    createdAt: order.createdAt,
    organizationName: organization.name,
    organization,
    paymentCondition: toPaymentCondition(order.paymentCondition),
    logo,
    seller: order.seller,
    customer: toCustomer(order.customer),
    items: order.items,
  };
}

export async function sendOrderPdfReply(
  reply: FastifyReply,
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForPdf>>>,
) {
  const pdf = await buildOrderPdf(await orderToPdfInput(order));
  const filename = orderPdfFilename(order);
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `inline; filename="${filename}"`)
    .send(pdf);
}

export async function sendOrderPdf80mmReply(
  reply: FastifyReply,
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForPdf>>>,
) {
  const pdf = await buildOrderPdf80mm(await orderToPdfInput(order));
  const filename = orderPdf80mmFilename(order);
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `inline; filename="${filename}"`)
    .send(pdf);
}
