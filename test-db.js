const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const mills = await prisma.mill.findMany();
        console.log("Success! Mills:", mills);
    } catch (error) {
        console.error("Error querying db:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
