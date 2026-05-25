const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLatestWOs() {
    const wos = await prisma.workOrder.findMany({
        take: 5,
        orderBy: { id: 'desc' },
        include: {
            reporter: true,
            audit_logs: true
        }
    });
    
    for (const wo of wos) {
        console.log(`WO: ${wo.wo_no} | Category: ${wo.category} | Created By: ${wo.reporter.username} (${wo.reporter.role})`);
    }
}
checkLatestWOs().then(() => prisma.$disconnect());
