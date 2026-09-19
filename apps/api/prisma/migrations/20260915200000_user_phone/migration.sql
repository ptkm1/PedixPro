-- Telefone de contato do usuário (vendedor no corpo do pedido).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
