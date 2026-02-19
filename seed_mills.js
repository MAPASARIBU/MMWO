const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const mills = [
    { name: 'BTPOM', location: 'Sumatra' }, // Bunga Tanjung
    { name: 'MMPOM', location: 'Unknown' },
    { name: 'DMPOM', location: 'Unknown' },
    { name: 'AMPOM', location: 'Unknown' },
    { name: 'BMPOM', location: 'Unknown' },
    { name: 'PLPOM', location: 'Unknown' },
    { name: 'UMPOM', location: 'Unknown' }
];

async function main() {
    console.log('Seeding Mills...');

    for (const millData of mills) {
        // Upsert by name if possible, or we assume ID mapping isn't strict yet
        // Since name isn't unique in schema (maybe), let's findFirst to check

        const existing = await prisma.mill.findFirst({ where: { name: millData.name } });

        if (existing) {
            console.log(`Mill ${millData.name} already exists.`);
        } else {
            // Check if we can rename "BUNGA TANJUNG MILL" to "BTPOM" content-wise?
            // User asked for "BTPOM" specifically in the list.
            // If "BUNGA TANJUNG MILL" exists (from previous seed), let's update it to BTPOM to preserve associations
            if (millData.name === 'BTPOM') {
                const old = await prisma.mill.findFirst({ where: { name: 'BUNGA TANJUNG MILL' } });
                if (old) {
                    await prisma.mill.update({
                        where: { id: old.id },
                        data: { name: 'BTPOM' }
                    });
                    console.log('Updated BUNGA TANJUNG MILL to BTPOM');
                    continue;
                }
            }

            await prisma.mill.create({
                data: millData
            });
            console.log(`Created ${millData.name}`);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
