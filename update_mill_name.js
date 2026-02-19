const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Updating Mill Name...');

    // Update the first mill found or specific ID 1
    const mill = await prisma.mill.updateMany({
        where: {}, // Update all or specific id
        data: {
            name: 'BUNGA TANJUNG MILL'
        }
    });

    console.log('Updated Mills:', mill.count);

    const updated = await prisma.mill.findFirst();
    console.log('Current Mill Name:', updated.name);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
