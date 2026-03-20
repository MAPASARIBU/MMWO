const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const parts = await prisma.part.findMany({
        where: { is_active: true },
        include: { wos: true }
    });
    console.log("ALL ACTIVE PARTS:");
    parts.forEach(p => {
        if (p.wos.length > 0) {
            console.log(`Part ${p.id} (${p.name}) has WOs:`, p.wos.map(wo => `${wo.wo_no} (${wo.status})`));
        }
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
        include: { wos: true }
    });
    console.log("\nFILTERED PARTS (should NOT include OPEN wos):");
    filteredParts.forEach(p => {
        if (p.wos.length > 0) {
            console.log(`Part ${p.id} (${p.name}) included despite having WOs:`, p.wos.map(wo => `${wo.wo_no} (${wo.status})`));
        }
    });
}
check().finally(() => prisma.$disconnect());
