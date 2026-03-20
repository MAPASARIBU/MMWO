require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    console.log("Fetching parts...");
    const allParts = await prisma.part.findMany({
        where: { is_active: true },
        include: { wos: { select: { id: true, wo_no: true, status: true, part_id: true } } }
    });

    const filteredParts = await prisma.part.findMany({
        where: {
            is_active: true,
            wos: {
                none: {
                    status: { not: 'CLOSED' }
                }
            }
        },
        include: { wos: { select: { id: true, wo_no: true, status: true, part_id: true } } }
    });

    fs.writeFileSync('diag_all.json', JSON.stringify(allParts, null, 2));
    fs.writeFileSync('diag_filtered.json', JSON.stringify(filteredParts, null, 2));
    console.log("Done writing JSON");
}

main().catch(console.error).finally(() => prisma.$disconnect());
