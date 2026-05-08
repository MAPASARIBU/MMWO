const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
    const users = await prisma.user.findMany({
        where: { phone: { not: null }, is_active: true }
    });
    console.log("Active users with phones:");
    users.forEach(u => console.log(`ID: ${u.id}, Name: ${u.name}, Role: ${u.role}, Phone: ${u.phone}, Mill: ${u.mill_id}`));
}
checkUsers().then(() => prisma.$disconnect());
