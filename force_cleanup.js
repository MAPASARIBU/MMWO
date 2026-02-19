const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("FORCE CLEANUP for Mill 1 duplicates...");

    const stations = await prisma.station.findMany({
        where: { mill_id: 1 }
    });

    // Group by name
    const grouped = {};
    for (const s of stations) {
        if (!grouped[s.name]) grouped[s.name] = [];
        grouped[s.name].push(s);
    }

    for (const name in grouped) {
        const group = grouped[name];
        if (group.length > 1) {
            console.log(`Duplicates for "${name}": ${group.map(s => s.id).join(', ')}`);
            // Sort to keep lowest ID (or <= 100 if preferred, but let's just be consistent: keep lowest)
            // Actually, let's strictly prefer ID <= 16 if available (original original)
            group.sort((a, b) => {
                if (a.id <= 16 && b.id > 16) return -1;
                if (b.id <= 16 && a.id > 16) return 1;
                return a.id - b.id;
            });

            const toKeep = group[0];
            const toDelete = group.slice(1);

            console.log(`  Keeping ${toKeep.id}, Deleting ${toDelete.map(s => s.id).join(',')}`);

            for (const s of toDelete) {
                await prisma.station.delete({ where: { id: s.id } });
            }
        }
    }
    console.log("Done.");
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
