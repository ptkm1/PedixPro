import type { Role } from "@pedidos/shared";

/** Papéis que podem entrar no app mobile. */
export function isMobileAppRole(role: Role): boolean {
  return role === "SELLER" || role === "ADMIN" || role === "MANAGER";
}

/** Staff que pode escolher vendedor / venda direta na Nova Venda. */
export function canAssignSaleSeller(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function sellerMobileLoginRejectedMessage(_role: Role): string {
  return "Este app é para vendedores, administradores e gestores.";
}

export function sellerMobileBlockedScreenCopy(_role: Role): {
  title: string;
  body: string;
} {
  return {
    title: "Acesso em breve",
    body: "Por enquanto, apenas contas de vendedor, administrador e gestor usam este app.",
  };
}
