require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log("Migrating legacy part_id to Many-to-Many WorkOrderParts...");
    const wos = await prisma.workOrder.findMany({
        where: { part_id: { not: null } }
    });
    
    let count = 0;
    for (const wo of wos) {
        // Connect the legacy part_id to the new parts array relation
        await prisma.workOrder.update({
            where: { id: wo.id },
            data: {
                parts: {
                    connect: [{ id: wo.part_id }]
                }
            }
        });
        count++;
    }
    console.log(`Successfully migrated ${count} WorkOrders to use the Many-to-Many parts relationship.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
