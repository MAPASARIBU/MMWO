const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTable() {
    try {
        const count = await prisma.whatsAppSession.count();
        console.log(`Table exists! Row count: ${count}`);
    } catch (error) {
        console.error("Error querying table:", error.message);
    }
}
checkTable().then(() => prisma.$disconnect());
