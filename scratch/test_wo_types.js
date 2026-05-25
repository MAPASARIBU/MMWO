const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const types = await prisma.workOrder.groupBy({
        by: ['type'],
        _count: {
            type: true
        }
    });
    console.log(types);
}
main().catch(console.error).finally(() => prisma.$disconnect());
