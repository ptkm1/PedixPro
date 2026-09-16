import { z } from "zod";

export const ATTRIBUTE_FIELD_TYPES = ["text", "textarea", "number", "boolean", "select"] as const;
export type AttributeFieldType = (typeof ATTRIBUTE_FIELD_TYPES)[number];

export type AttributeFieldDef = z.infer<typeof attributeFieldDefSchema>;

const selectOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const attributeFieldDefSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case começando com letra"),
  label: z.string().min(1).max(120),
  type: z.enum(ATTRIBUTE_FIELD_TYPES),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
  section: z.string().max(80).optional(),
  options: z.array(selectOptionSchema).min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

export const attributeSchemaValidator = z.array(attributeFieldDefSchema).max(48);

/** Interpreta JSON salvo na categoria; retorna erro legível ou lista válida (vazia = sem campos extras). */
export function parseCategoryAttributeSchema(
  raw: unknown,
): { ok: true; defs: AttributeFieldDef[] } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, defs: [] };
  const r = attributeSchemaValidator.safeParse(raw);
  if (!r.success) return { ok: false, error: "attributeSchema inválido: revise o JSON dos campos" };
  const keys = new Set<string>();
  for (const d of r.data) {
    if (keys.has(d.key)) return { ok: false, error: `Chave duplicada no schema: ${d.key}` };
    keys.add(d.key);
    if (d.type === "select" && (!d.options || d.options.length === 0)) {
      return { ok: false, error: `Campo "${d.label}" (select) precisa de options` };
    }
    if (d.type !== "select" && d.options?.length) {
      return { ok: false, error: `Campo "${d.label}": options só são permitidas em type select` };
    }
  }
  return { ok: true, defs: r.data };
}

function normalizeIncomingAttributes(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

/**
 * Chaves que o formulário/coluna canônica replica em `attributes`
 * (ex.: NCM fiscal). Não fazem parte do schema extra da categoria.
 */
export const RESERVED_PRODUCT_ATTRIBUTE_KEYS = new Set(["ncm"]);

/**
 * Valida e normaliza valores conforme defs.
 * Chaves fora do schema da categoria são ignoradas (legado/seed),
 * não bloqueiam o save — só defs conhecidas entram no resultado.
 */
export function validateProductAttributes(
  raw: unknown,
  defs: AttributeFieldDef[],
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const attrs = normalizeIncomingAttributes(raw);
  const out: Record<string, unknown> = {};

  for (const def of defs) {
    const rawVal = attrs[def.key];
    const missing =
      rawVal === undefined ||
      rawVal === null ||
      (typeof rawVal === "string" && rawVal.trim() === "");

    if (def.required) {
      if (def.type === "boolean") {
        const okBool =
          typeof rawVal === "boolean" ||
          rawVal === true ||
          rawVal === false ||
          rawVal === "true" ||
          rawVal === "false";
        if (!okBool) return { ok: false, error: `Campo obrigatório: ${def.label}` };
      } else if (missing) {
        return { ok: false, error: `Campo obrigatório: ${def.label}` };
      }
    }

    if (missing && def.type !== "boolean") continue;

    switch (def.type) {
      case "text":
      case "textarea": {
        if (typeof rawVal !== "string") return { ok: false, error: `${def.label}: esperado texto` };
        out[def.key] = rawVal.trim();
        break;
      }
      case "number": {
        const n = typeof rawVal === "number" ? rawVal : Number(String(rawVal).replace(",", "."));
        if (Number.isNaN(n)) return { ok: false, error: `${def.label}: número inválido` };
        if (def.min !== undefined && n < def.min) return { ok: false, error: `${def.label}: mínimo ${def.min}` };
        if (def.max !== undefined && n > def.max) return { ok: false, error: `${def.label}: máximo ${def.max}` };
        out[def.key] = n;
        break;
      }
      case "boolean": {
        let b: boolean;
        if (typeof rawVal === "boolean") b = rawVal;
        else if (rawVal === "true") b = true;
        else if (rawVal === "false") b = false;
        else return { ok: false, error: `${def.label}: esperado verdadeiro/falso` };
        out[def.key] = b;
        break;
      }
      case "select": {
        const s = String(rawVal).trim();
        const okOpt = def.options?.some((o) => o.value === s);
        if (!okOpt) return { ok: false, error: `${def.label}: opção inválida` };
        out[def.key] = s;
        break;
      }
      default:
        break;
    }
  }

  // Preserva NCM espelhado em attributes (coluna canônica).
  if (
    typeof attrs.ncm === "string" &&
    attrs.ncm.trim() &&
    out.ncm === undefined
  ) {
    out.ncm = attrs.ncm.trim();
  }

  return { ok: true, value: out };
}
