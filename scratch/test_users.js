const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
    const users = await prisma.user.findMany({
        select: { id: true, username: true, role: true, mill_id: true, phone: true }
    });
    console.log("USERS:");
    console.table(users);
}
checkUsers().then(() => prisma.$disconnect());
