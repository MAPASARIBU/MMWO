const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Cleaning up duplicate stations for Mill 1...");

    // Delete stations with ID > 100 for Mill 1 (BUNGA TANJUNG)
    // We keep IDs 1-16 which were the original ones.
    const deleted = await prisma.station.deleteMany({
        where: {
            mill_id: 1,
            id: { gt: 100 }
        }
    });

    console.log(`Deleted ${deleted.count} duplicate stations.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
