const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const wos = await prisma.workOrder.findMany({
        take: 10,
        select: {
            wo_no: true,
            type: true,
            created_at: true,
            completed_at: true,
            status: true
        },
        orderBy: { created_at: 'desc' }
    });
    console.log(wos);
}
main().catch(console.error).finally(() => prisma.$disconnect());
