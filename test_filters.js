require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    // Make sure Part 1 has a WO
    let part = await prisma.part.findUnique({ where: { id: 1 } });
    if (!part) return console.log("Part 1 not found");
    
    const existingWos = await prisma.workOrder.findMany({ where: { part_id: 1 } });
    if (existingWos.length === 0) {
        await prisma.workOrder.create({
            data: {
                wo_no: "WOTEST1",
                mill_id: part.equipment_id, // mock
                station_id: part.equipment_id, // mock
                equipment_id: part.equipment_id,
                part_id: part.id,
                category: "Mechanical",
                type: "Preventive",
                priority: "P1",
                description: "Test WO",
                status: "OPEN",
                reporter_id: 1
            }
        });
        console.log("Created test WO for part 1");
    }

    const filtered = await prisma.part.findMany({
        where: {
            is_active: true,
            wos: {
                none: {
                    status: { not: 'CLOSED' }
                }
            }
        }
    });
    console.log("Filtered active parts (not: CLOSED):", filtered.map(p => p.id));

    const filtered2 = await prisma.part.findMany({
        where: {
            is_active: true,
            wos: {
                none: {
                    status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'VERIFIED'] }
                }
            }
        }
    });
    console.log("Filtered active parts (in):", filtered2.map(p => p.id));
}
run().catch(console.error).finally(() => prisma.$disconnect());
