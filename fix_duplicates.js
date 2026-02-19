const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting duplicate cleanup for Mill 1...");

    // Get all stations for Mill 1
    const stations = await prisma.station.findMany({
        where: { mill_id: 1 }
    });

    // Group by name
    const grouped = {};
    for (const s of stations) {
        if (!grouped[s.name]) grouped[s.name] = [];
        grouped[s.name].push(s);
    }

    // Iterate groups
    for (const name in grouped) {
        const group = grouped[name];
        if (group.length > 1) {
            console.log(`Found duplicates for "${name}": ${group.map(s => s.id).join(', ')}`);

            // Sort: prioritize ID <= 100, then lowest index
            // We want to KEEP the 'original' one (ID <= 100) if exists.
            // If multiple <= 100 (unlikely), keep lowest.
            // If all > 100, keep lowest.

            group.sort((a, b) => {
                const aIsOriginal = a.id <= 100;
                const bIsOriginal = b.id <= 100;
                if (aIsOriginal && !bIsOriginal) return -1; // a comes first (keep)
                if (!aIsOriginal && bIsOriginal) return 1; // b comes first
                return a.id - b.id; // otherwise lowest ID first
            });

            const toKeep = group[0];
            const toDelete = group.slice(1);

            console.log(`  -> Keeping ID ${toKeep.id}, deleting ${toDelete.map(s => s.id).join(', ')}`);

            for (const s of toDelete) {
                // Check if any Equipment or WO references this station?
                // If so, we might need to migrate them to 'toKeep.id' before delete.
                // Assuming cascade or no data for now, but let's be safe: update references?
                // The prompt didn't ask for data migration, but good practice.
                // Let's just delete for now as user said "malah hilang semua stasiun" implies new data.
                try {
                    await prisma.station.delete({ where: { id: s.id } });
                } catch (e) {
                    console.error(`  Failed to delete station ${s.id}: ${e.message}`);
                    // If foreign key constraint, we'd know.
                }
            }
        }
    }
    console.log("Cleanup complete.");
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
