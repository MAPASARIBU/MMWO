const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSession() {
    const sessions = await prisma.whatsAppSession.findMany();
    console.log(`Found ${sessions.length} sessions.`);
    for (const s of sessions) {
        console.log(`Session ID: ${s.id}, Data size: ${s.data.length} bytes`);
    }
}
checkSession().then(() => prisma.$disconnect());
