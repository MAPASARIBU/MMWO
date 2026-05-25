const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testWoUsers(woId) {
    const wo = await prisma.workOrder.findUnique({ where: { id: woId } });
    if (!wo) return console.log('WO not found');
    
    let targetRoles = [];
    if (wo.category === 'Processing') {
        targetRoles = ['PROC', 'SPV', 'MANAGER'];
    } else {
        targetRoles = ['MTC', 'SPV', 'MANAGER'];
    }

    const targetUsers = await prisma.user.findMany({
        where: {
            mill_id: wo.mill_id,
            role: { in: targetRoles },
            is_active: true,
            phone: { not: null }
        }
    });
    
    console.log("WO:", wo.wo_no, wo.category);
    console.log("Target Roles:", targetRoles);
    console.log("Target Users:");
    console.table(targetUsers.map(u => ({ id: u.id, username: u.username, role: u.role, phone: u.phone })));
}

testWoUsers(90).then(() => testWoUsers(92)).then(() => prisma.$disconnect());
