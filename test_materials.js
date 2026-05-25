const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    console.log(await prisma.workOrderMaterial.findMany({ where: { wo_id: 180 } }));
}
main().catch(e=>console.error(e)).finally(()=>prisma.$disconnect());
