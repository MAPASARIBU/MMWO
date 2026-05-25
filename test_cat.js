const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const cats = await prisma.workOrder.findMany({ select: { category: true, type: true }, distinct: ['category', 'type'] });
    console.log(cats);
}
main().finally(() => prisma.$disconnect());
