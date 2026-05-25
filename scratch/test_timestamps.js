const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDates() {
    const wos = await prisma.workOrder.findMany({
        take: 5,
        orderBy: { id: 'desc' },
        include: { reporter: true }
    });
    
    for (const wo of wos) {
        console.log(`WO: ${wo.wo_no} | Created By: ${wo.reporter.username} | Date: ${wo.created_at}`);
    }
}
checkDates().then(() => prisma.$disconnect());
