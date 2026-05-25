const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listTables() {
    try {
        const result = await prisma.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';`;
        console.log("Tables in database:", result);
    } catch (error) {
        console.error("Error:", error);
    }
}
listTables().then(() => prisma.$disconnect());
