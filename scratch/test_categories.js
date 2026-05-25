const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCategories() {
    const wos = await prisma.workOrder.findMany({
        take: 5,
        orderBy: { id: 'desc' },
        include: { reporter: true }
    });
    
    for (const wo of wos) {
        console.log(`WO: ${wo.wo_no} | Reporter: ${wo.reporter.username} | Category: ${wo.category}`);
    }
}
checkCategories().then(() => prisma.$disconnect());
