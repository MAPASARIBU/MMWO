const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
    const wos = await prisma.workOrder.findMany({
        where: { id: { in: [80, 79] } }
    });
    console.log("WOs:", wos);

    if (wos.length > 0) {
        const millId = wos[0].mill_id;
        const users = await prisma.user.findMany({
            where: { mill_id: millId }
        });
        console.log("Users in mill:", users.map(u => ({ id: u.id, username: u.username, role: u.role, phone: u.phone, is_active: u.is_active })));
    }
}
checkUsers().then(() => prisma.$disconnect());
