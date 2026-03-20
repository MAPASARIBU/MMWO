const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Fetching parts without active WOs...");
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
    
    console.log("Filtered active parts:");
    filteredParts.forEach(p => console.log(`- Part: ${p.name} (WOs: ${p.wos.map(w=>w.status).join(',')})`));

    console.log("\nFetching ALL active parts with their WOs...");
    const allParts = await prisma.part.findMany({
        where: { is_active: true },
        include: { wos: true }
    });

    console.log("All active parts:");
    allParts.forEach(p => console.log(`- Part: ${p.id} ${p.name} (WOs: ${p.wos.length > 0 ? p.wos.map(w=>w.status).join(',') : 'None'})`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
