/**
 * Seed extra para testar Top fornecedores / escopo por vendedor.
 * Idempotente: apaga pedidos com notes = MARKER e recria.
 *
 * Uso: pnpm db:seed:sales-chart
 */
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";
import { requireOrgSituationId } from "../src/services/order-situations.js";

const MARKER = "seed-chart-demo";
const PASSWORD = "vendedor123";

type SupplierDef = {
  code: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
};

type SellerDef = {
  email: string;
  name: string;
};

const SUPPLIERS: SupplierDef[] = [
  {
    code: "BISC-CROC",
    tradeName: "BISCOITOS CROCANTE",
    legalName: "Indústria e Comércio de Biscoitos Crocante",
    cnpj: "49932607000107",
  },
  {
    code: "DOCE-SOL",
    tradeName: "DOCES DO SOL",
    legalName: "Doces do Sol Alimentos Ltda",
    cnpj: "11222333000181",
  },
  {
    code: "BEB-FONTE",
    tradeName: "FONTES BEBIDAS",
    legalName: "Fontes Bebidas e Sucos S.A.",
    cnpj: "22333444000162",
  },
  {
    code: "HIG-LIMPA",
    tradeName: "LIMPA TUDO",
    legalName: "Limpa Tudo Higiene e Limpeza Ltda",
    cnpj: "33444555000143",
  },
  {
    code: "SNACK-MAX",
    tradeName: "SNACK MAX",
    legalName: "Snack Max Indústria de Salgados",
    cnpj: "44555666000124",
  },
];

const EXTRA_SELLERS: SellerDef[] = [
  { email: "ana.vendedor@demo.com", name: "Ana Vendedora" },
  { email: "bruno.vendedor@demo.com", name: "Bruno Vendedor" },
  { email: "carla.vendedor@demo.com", name: "Carla Vendedora" },
];

const PRODUCT_BY_SUPPLIER: Record<
  string,
  { name: string; sku: string; barcode: string; basePrice: number }
> = {
  "BISC-CROC": {
    name: "Biscoito Crocante 400g",
    sku: "BC-400",
    barcode: "7891000100001",
    basePrice: 12.5,
  },
  "DOCE-SOL": {
    name: "Balas Sortidas 1kg",
    sku: "DS-1KG",
    barcode: "7891000100002",
    basePrice: 28.9,
  },
  "BEB-FONTE": {
    name: "Suco Natural 1L",
    sku: "BF-1L",
    barcode: "7891000100003",
    basePrice: 8.75,
  },
  "HIG-LIMPA": {
    name: "Detergente Neutro 500ml",
    sku: "HL-500",
    barcode: "7891000100004",
    basePrice: 4.2,
  },
  "SNACK-MAX": {
    name: "Salgadinho Max 150g",
    sku: "SM-150",
    barcode: "7891000100005",
    basePrice: 6.5,
  },
};

function daysAgo(n: number, hour = 14): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 15, 0, 0);
  return d;
}

async function upsertSeller(
  organizationId: string,
  def: SellerDef,
  managerUserId: string | null,
  passwordHash: string,
) {
  const user = await prisma.user.upsert({
    where: { email: def.email },
    update: {
      passwordHash,
      name: def.name,
      role: Role.SELLER,
      organizationId,
      activatedAt: new Date(),
    },
    create: {
      email: def.email,
      passwordHash,
      name: def.name,
      role: Role.SELLER,
      organizationId,
      activatedAt: new Date(),
    },
  });

  return prisma.seller.upsert({
    where: { userId: user.id },
    update: {
      organizationId,
      commissionPercent: 8,
      active: true,
      managerUserId,
    },
    create: {
      userId: user.id,
      organizationId,
      commissionPercent: 8,
      active: true,
      managerUserId,
    },
  });
}

async function seedOrg(organizationId: string, orgLabel: string) {
  console.log(`\n→ Seed chart demo: ${orgLabel} (${organizationId})`);

  const category =
    (await prisma.productCategory.findFirst({
      where: { organizationId, code: "GENERAL" },
    })) ??
    (await prisma.productCategory.create({
      data: {
        organizationId,
        code: "GENERAL",
        name: "Geral",
        attributeSchema: [],
      },
    }));

  const suppliers = [];
  for (const s of SUPPLIERS) {
    const row = await prisma.supplier.upsert({
      where: {
        organizationId_code: { organizationId, code: s.code },
      },
      create: {
        organizationId,
        code: s.code,
        tradeName: s.tradeName,
        legalName: s.legalName,
        cnpj: s.cnpj,
        active: true,
      },
      update: {
        tradeName: s.tradeName,
        legalName: s.legalName,
        cnpj: s.cnpj,
        active: true,
      },
    });
    suppliers.push(row);
  }

  const products = [];
  for (const supplier of suppliers) {
    const def = PRODUCT_BY_SUPPLIER[supplier.code]!;
    const existing = await prisma.product.findFirst({
      where: { organizationId, sku: def.sku },
    });
    if (existing) {
      const updated = await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: def.name,
          barcode: def.barcode,
          basePrice: def.basePrice,
          supplierId: supplier.id,
          stockQty: 500,
          categoryId: category.id,
        },
      });
      products.push(updated);
    } else {
      products.push(
        await prisma.product.create({
          data: {
            organizationId,
            name: def.name,
            sku: def.sku,
            barcode: def.barcode,
            basePrice: def.basePrice,
            stockQty: 500,
            categoryId: category.id,
            supplierId: supplier.id,
            attributes: {},
          },
        }),
      );
    }
  }

  const manager = await prisma.user.findFirst({
    where: { organizationId, role: Role.MANAGER },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const sellers = [];

  const existingSellers = await prisma.seller.findMany({
    where: { organizationId, active: true },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  sellers.push(...existingSellers);

  for (const def of EXTRA_SELLERS) {
    const s = await upsertSeller(
      organizationId,
      {
        email:
          organizationId === "seed-org"
            ? def.email
            : def.email.replace(
                "@demo.com",
                `+${organizationId.slice(-4)}@demo.com`,
              ),
        name: def.name,
      },
      manager?.id ?? null,
      passwordHash,
    );
    if (!sellers.some((x) => x.id === s.id)) sellers.push(s);
  }

  // Liberar todos os produtos chart para todos os vendedores da org
  for (const seller of sellers) {
    for (const product of products) {
      await prisma.sellerProduct.upsert({
        where: {
          sellerId_productId: {
            sellerId: seller.id,
            productId: product.id,
          },
        },
        create: { sellerId: seller.id, productId: product.id },
        update: {},
      });
    }
  }

  const customers = [];
  for (let i = 1; i <= 4; i++) {
    const name = `Cliente Chart ${i}`;
    const found = await prisma.customer.findFirst({
      where: { organizationId, name },
    });
    customers.push(
      found ??
        (await prisma.customer.create({
          data: {
            organizationId,
            name,
            email: `cliente.chart${i}@exemplo.com`,
            sellerId: sellers[i % sellers.length]!.id,
          },
        })),
    );
  }

  // Recria pedidos deste seed
  await prisma.order.deleteMany({
    where: { organizationId, notes: MARKER },
  });

  const openSituationId = await requireOrgSituationId(organizationId, "OPEN");

  // Mix: este mês (julho) + dias recentes + algum histórico — >= 12 vendas
  const plans: Array<{
    daysAgo: number;
    sellerIdx: number;
    productIdx: number;
    qty: number;
  }> = [
    { daysAgo: 0, sellerIdx: 0, productIdx: 0, qty: 10 },
    { daysAgo: 1, sellerIdx: 1, productIdx: 1, qty: 8 },
    { daysAgo: 1, sellerIdx: 2, productIdx: 2, qty: 20 },
    { daysAgo: 2, sellerIdx: 0, productIdx: 3, qty: 15 },
    { daysAgo: 3, sellerIdx: 3 % sellers.length, productIdx: 4, qty: 12 },
    { daysAgo: 4, sellerIdx: 1, productIdx: 0, qty: 6 },
    { daysAgo: 5, sellerIdx: 2, productIdx: 1, qty: 14 },
    { daysAgo: 6, sellerIdx: 0, productIdx: 4, qty: 9 },
    { daysAgo: 7, sellerIdx: 1, productIdx: 2, qty: 18 },
    { daysAgo: 8, sellerIdx: 2, productIdx: 3, qty: 7 },
    { daysAgo: 10, sellerIdx: 0, productIdx: 1, qty: 11 },
    { daysAgo: 12, sellerIdx: 3 % sellers.length, productIdx: 0, qty: 5 },
    { daysAgo: 15, sellerIdx: 1, productIdx: 4, qty: 22 },
    { daysAgo: 20, sellerIdx: 2, productIdx: 2, qty: 16 },
    { daysAgo: 25, sellerIdx: 0, productIdx: 3, qty: 13 },
    // dois itens no mesmo pedido (multi-fornecedor)
  ];

  let created = 0;
  for (const plan of plans) {
    const seller = sellers[plan.sellerIdx % sellers.length]!;
    const product = products[plan.productIdx % products.length]!;
    const customer = customers[created % customers.length]!;
    const unitPrice = Number(product.basePrice);
    const total = unitPrice * plan.qty;
    const createdAt = daysAgo(plan.daysAgo, 10 + (created % 8));

    await prisma.order.create({
      data: {
        organizationId,
        sellerId: seller.id,
        customerId: customer.id,
        status: "CONFIRMED",
        situationId: openSituationId,
        totalAmount: total,
        notes: MARKER,
        createdAt,
        items: {
          create: [
            {
              productId: product.id,
              quantity: plan.qty,
              unitPrice,
              productName: product.name,
            },
          ],
        },
      },
    });
    created += 1;
  }

  // Pedido com 2 fornecedores diferentes
  const pA = products[0]!;
  const pB = products[2]!;
  const sellerMix = sellers[1 % sellers.length]!;
  await prisma.order.create({
    data: {
      organizationId,
      sellerId: sellerMix.id,
      customerId: customers[0]!.id,
      status: "CONFIRMED",
      situationId: openSituationId,
      totalAmount: Number(pA.basePrice) * 4 + Number(pB.basePrice) * 6,
      notes: MARKER,
      createdAt: daysAgo(2, 16),
      items: {
        create: [
          {
            productId: pA.id,
            quantity: 4,
            unitPrice: Number(pA.basePrice),
            productName: pA.name,
          },
          {
            productId: pB.id,
            quantity: 6,
            unitPrice: Number(pB.basePrice),
            productName: pB.name,
          },
        ],
      },
    },
  });
  created += 1;

  const loginEmails = EXTRA_SELLERS.map((s) =>
    organizationId === "seed-org"
      ? s.email
      : s.email.replace("@demo.com", `+${organizationId.slice(-4)}@demo.com`),
  );
  console.log(
    `  ${suppliers.length} fornecedores, ${sellers.length} vendedores, ${products.length} produtos, ${created} vendas CONFIRMADAS`,
  );
  console.log(`  Logins extras (senha ${PASSWORD}): ${loginEmails.join(", ")}`);
}

async function main() {
  const argId = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const orgs = await prisma.organization.findMany({
    where: argId ? { id: argId } : { id: "seed-org" },
    select: { id: true, name: true, displayName: true },
    orderBy: { createdAt: "asc" },
  });

  if (orgs.length === 0) {
    throw new Error(
      argId
        ? `Organização ${argId} não encontrada.`
        : "Empresa Demo (seed-org) não encontrada. Rode pnpm db:seed primeiro, ou passe um organizationId.",
    );
  }

  for (const org of orgs) {
    await seedOrg(org.id, org.displayName ?? org.name);
  }

  console.log("\nSeed chart demo concluído (somente a(s) org(s) alvo).");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
