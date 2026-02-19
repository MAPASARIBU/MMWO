const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const stations = await prisma.station.findMany({
        where: { mill_id: 1 },
        orderBy: { name: 'asc' }
    });
    console.log("Stations for Mill 1:");
    stations.forEach(s => console.log(`${s.id}: ${s.name}`));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
