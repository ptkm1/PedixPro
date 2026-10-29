import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const customerListSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  code: z.string().trim().max(80).optional(),
  document: z.string().trim().max(32).optional(),
  legalName: z.string().trim().max(200).optional(),
  tradeName: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
});

export type CustomerListSearchQuery = z.infer<
  typeof customerListSearchQuerySchema
>;

function textContains(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" };
}

/** Cláusulas AND para GET /seller/customers (org já vem no `where` base). */
export function customerListSearchAnd(
  data: CustomerListSearchQuery,
): Prisma.CustomerWhereInput[] {
  const and: Prisma.CustomerWhereInput[] = [];

  const q = data.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const text = textContains(q);
    const or: Prisma.CustomerWhereInput[] = [
      { name: text },
      { tradeName: text },
      { legalName: text },
      { city: text },
      { email: text },
      { phone: text },
      { cnpj: text },
      { cpf: text },
    ];
    if (digits.length > 0) {
      or.push(
        { cnpj: { contains: digits } },
        { cpf: { contains: digits } },
        { phone: { contains: digits } },
      );
      const asCode = Number(digits);
      if (
        Number.isInteger(asCode) &&
        String(asCode) === digits &&
        digits.length <= 9
      ) {
        or.push({ code: asCode });
      }
    }
    and.push({ OR: or });
  }

  const codeRaw = data.code?.trim();
  if (codeRaw) {
    const digits = codeRaw.replace(/\D/g, "");
    const text = textContains(codeRaw);
    const or: Prisma.CustomerWhereInput[] = [
      { name: text },
      { tradeName: text },
      { legalName: text },
    ];
    const asCode = Number(digits);
    if (
      digits.length > 0 &&
      Number.isInteger(asCode) &&
      String(asCode) === digits &&
      digits.length <= 9
    ) {
      or.push({ code: asCode });
    }
    and.push({ OR: or });
  }

  const document = data.document?.trim();
  if (document) {
    const digits = document.replace(/\D/g, "");
    const text = textContains(document);
    const or: Prisma.CustomerWhereInput[] = [
      { cnpj: text },
      { cpf: text },
    ];
    if (digits.length > 0) {
      or.push(
        { cnpj: { contains: digits } },
        { cpf: { contains: digits } },
      );
    }
    and.push({ OR: or });
  }

  const legalName = data.legalName?.trim();
  if (legalName) {
    const text = textContains(legalName);
    and.push({
      OR: [{ legalName: text }, { name: text }],
    });
  }

  const tradeName = data.tradeName?.trim();
  if (tradeName) {
    const text = textContains(tradeName);
    and.push({
      OR: [{ tradeName: text }, { name: text }],
    });
  }

  const city = data.city?.trim();
  if (city) {
    and.push({ city: textContains(city) });
  }

  return and;
}
