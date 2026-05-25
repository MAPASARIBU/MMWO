const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkWOs() {
    const wos = await prisma.workOrder.findMany({
        where: {
            wo_no: { in: ['WO-20260508-0103', 'WO-20260508-0102', 'WO-20260508-0101', 'WO-20260508-0098', 'WO-20260508-0097'] }
        },
        orderBy: { id: 'desc' },
        include: { reporter: true }
    });
    
    for (const wo of wos) {
        console.log(`WO: ${wo.wo_no} | Category: ${wo.category} | Created By: ${wo.reporter.username} | Time: ${wo.created_at}`);
    }
}
checkWOs().then(() => prisma.$disconnect());
