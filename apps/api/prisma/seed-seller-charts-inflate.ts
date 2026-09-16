/**
 * Infla gráficos do app vendedor: vendas diárias (90 dias) + metas mensais.
 * Idempotente: apaga pedidos/metas com MARKER e recria.
 *
 * Uso:
 *   pnpm db:seed:seller-charts
 *   pnpm db:seed:seller-charts -- --email=vendedor@demo.com
 */
import { prisma } from "../src/db.js";
import { requireOrgSituationId } from "../src/services/order-situations.js";
import { buildGoalScopeKey } from "../src/services/seller-monthly-goals.js";

const MARKER = "seed-seller-charts";
const DEFAULT_EMAIL = "vendedor@demo.com";

function parseEmail(): string {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--email="));
  if (arg) return arg.slice("--email=".length).trim().toLowerCase();
  const positional = process.argv.slice(2).find((a) => !a.startsWith("-"));
  return (positional ?? DEFAULT_EMAIL).trim().toLowerCase();
}

function localDay(
  year: number,
  monthIndex: number,
  day: number,
  hour = 14,
): Date {
  return new Date(year, monthIndex, day, hour, 30, 0, 0);
}

function daysAgoLocal(n: number, hour = 11): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 20 + (n % 30), 0, 0);
  return d;
}

/** Perfil diário: onda + picos midweek, para o gráfico não ficar flat. */
function dayProfile(daysAgo: number): { orders: number; qtyBase: number } {
  const weekday = daysAgoLocal(daysAgo).getDay(); // 0=dom
  const weekend = weekday === 0 || weekday === 6;
  const wave = 0.65 + 0.35 * Math.sin(daysAgo / 4.2);
  const midweekBoost = weekday === 2 || weekday === 4 ? 1.35 : 1;
  const qtyBase = Math.max(
    1,
    Math.round((weekend ? 2 : 5) * wave * midweekBoost),
  );
  const orders = weekend ? 1 : daysAgo % 5 === 0 ? 3 : daysAgo % 3 === 0 ? 2 : 1;
  return { orders, qtyBase };
}

async function main() {
  const email = parseEmail();
  console.log(`\n→ Seed seller charts: ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { seller: true },
  });
  if (!user?.seller) {
    throw new Error(`Usuário vendedor não encontrado: ${email}`);
  }

  const organizationId = user.organizationId;
  const sellerId = user.seller.id;

  const establishment = await prisma.establishment.findFirst({
    where: { organizationId, active: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!establishment) {
    throw new Error(`Nenhum establishment ativo na org ${organizationId}`);
  }

  const products = await prisma.product.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    take: 8,
  });
  if (products.length === 0) {
    throw new Error("Org sem produtos — rode o seed base antes.");
  }

  let customer = await prisma.customer.findFirst({
    where: { organizationId, sellerId },
    orderBy: { createdAt: "asc" },
  });
  if (!customer) {
    customer = await prisma.customer.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        organizationId,
        sellerId,
        name: "Cliente Charts Seed",
        email: "cliente.charts.seed@exemplo.com",
      },
    });
  }

  const openSituationId = await requireOrgSituationId(organizationId, "OPEN");

  await prisma.order.deleteMany({
    where: { organizationId, sellerId, notes: MARKER },
  });
  await prisma.sellerMonthlyGoal.deleteMany({
    where: {
      organizationId,
      sellerId,
      title: { contains: MARKER },
    },
  });

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth(); // 0-based
  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastYear = lastMonthDate.getFullYear();
  const lastMonth = lastMonthDate.getMonth();

  type Plan = { at: Date; productIdx: number; qty: number };
  const plans: Plan[] = [];

  // Últimos 90 dias (cobre this_month, last_7, last_90 e parte do mês passado)
  for (let d = 0; d <= 89; d++) {
    const { orders, qtyBase } = dayProfile(d);
    for (let o = 0; o < orders; o++) {
      const productIdx = (d + o) % products.length;
      const qty = qtyBase + (o + 1) * (1 + (d % 3));
      plans.push({
        at: daysAgoLocal(d, 9 + o * 3 + (d % 4)),
        productIdx,
        qty,
      });
    }
  }

  // Garante cobertura densa no mês passado (caso estejamos no início do mês)
  const daysInLastMonth = new Date(thisYear, thisMonth, 0).getDate();
  for (let day = 1; day <= daysInLastMonth; day++) {
    const at = localDay(lastYear, lastMonth, day, 10 + (day % 7));
    const already = plans.some(
      (p) =>
        p.at.getFullYear() === lastYear &&
        p.at.getMonth() === lastMonth &&
        p.at.getDate() === day,
    );
    if (already) continue;
    plans.push({
      at,
      productIdx: day % products.length,
      qty: 4 + (day % 8),
    });
  }

  // Hoje com volume extra (StatCard "hoje")
  plans.push(
    { at: daysAgoLocal(0, 8), productIdx: 0, qty: 12 },
    { at: daysAgoLocal(0, 13), productIdx: 1 % products.length, qty: 8 },
    { at: daysAgoLocal(0, 17), productIdx: 2 % products.length, qty: 6 },
  );

  let created = 0;
  let monthRevenue = 0;
  let lastMonthRevenue = 0;

  for (const plan of plans) {
    const product = products[plan.productIdx]!;
    const unitPrice = Number(product.basePrice);
    const total = Math.round(unitPrice * plan.qty * 100) / 100;
    const y = plan.at.getFullYear();
    const m = plan.at.getMonth();

    await prisma.order.create({
      data: {
        organizationId,
        establishmentId: establishment.id,
        sellerId,
        customerId: customer.id,
        status: "CONFIRMED",
        situationId: openSituationId,
        totalAmount: total,
        notes: MARKER,
        createdAt: plan.at,
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
    if (y === thisYear && m === thisMonth) monthRevenue += total;
    if (y === lastYear && m === lastMonth) lastMonthRevenue += total;
  }

  monthRevenue = Math.round(monthRevenue * 100) / 100;
  lastMonthRevenue = Math.round(lastMonthRevenue * 100) / 100;

  // Meta deste mês: ~88% do realizado → gauge quase cheio / "atingida" se passar
  const thisTarget = Math.max(
    500,
    Math.round((monthRevenue / 0.88) * 100) / 100,
  );
  // Meta mês passado: já batida (~112%)
  const lastTarget = Math.max(
    500,
    Math.round((lastMonthRevenue / 1.12) * 100) / 100,
  );

  const scopeKey = buildGoalScopeKey("SELLER", sellerId);

  await prisma.sellerMonthlyGoal.upsert({
    where: {
      organizationId_scopeKey_year_month: {
        organizationId,
        scopeKey,
        year: thisYear,
        month: thisMonth + 1,
      },
    },
    create: {
      organizationId,
      scope: "SELLER",
      scopeKey,
      sellerId,
      year: thisYear,
      month: thisMonth + 1,
      title: `Meta do mês (${MARKER})`,
      targetAmount: thisTarget,
    },
    update: {
      title: `Meta do mês (${MARKER})`,
      targetAmount: thisTarget,
      sellerId,
      scope: "SELLER",
    },
  });

  await prisma.sellerMonthlyGoal.upsert({
    where: {
      organizationId_scopeKey_year_month: {
        organizationId,
        scopeKey,
        year: lastYear,
        month: lastMonth + 1,
      },
    },
    create: {
      organizationId,
      scope: "SELLER",
      scopeKey,
      sellerId,
      year: lastYear,
      month: lastMonth + 1,
      title: `Meta mês passado (${MARKER})`,
      targetAmount: lastTarget,
    },
    update: {
      title: `Meta mês passado (${MARKER})`,
      targetAmount: lastTarget,
      sellerId,
      scope: "SELLER",
    },
  });

  console.log(`  Vendedor: ${user.name} (${email})`);
  console.log(`  Org: ${organizationId}`);
  console.log(`  Pedidos CONFIRMADOS criados: ${created}`);
  console.log(
    `  Faturamento este mês: R$ ${monthRevenue.toFixed(2)} · meta R$ ${thisTarget.toFixed(2)} (~${Math.round((monthRevenue / thisTarget) * 100)}%)`,
  );
  console.log(
    `  Faturamento mês passado: R$ ${lastMonthRevenue.toFixed(2)} · meta R$ ${lastTarget.toFixed(2)} (~${Math.round((lastMonthRevenue / lastTarget) * 100)}%)`,
  );
  console.log("Seed seller charts concluído.\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
