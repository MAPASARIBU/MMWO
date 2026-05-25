const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const activeParts = await prisma.part.findMany({
        where: { is_active: true, equipment: { is: { station: { is: { mill_id: 1 } } } } }
    });
    console.log('Success:', activeParts.length);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
