const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Master List in Strict Order (1-based index)
    const masterList = [
        "FFB RECEPTION",
        "STERILIZER",
        "THRESHING",
        "PRESSING",
        "NUT & KERNEL",
        "CLARIFICATION",
        "POWER PLANT",
        "STEAM PLANT",
        "WATER TREATMENT PLANT",
        "KERNEL BIN STORAGE",
        "CPO STORAGE TANK",
        "EFFLUENT POND",
        "WASHING PLANT",
        "BIOGAS PLANT",
        "KCP",              // Special: MMPOM
        "COMPOSTING PLANT", // Special: BMPOM
        "WORKSHOP",
        "MILL BUILDING",
        "OFFICE"
    ];

    const mills = await prisma.mill.findMany();

    if (mills.length === 0) {
        console.error('No mills found!');
        return;
    }

    console.log(`Found ${mills.length} mills. Enforcing Station Order...`);

    for (const mill of mills) {
        console.log(`Processing Mill: ${mill.name} (${mill.id})`);

        // Filter list for this mill
        const millStations = masterList.filter(name => {
            if (name === 'KCP' && mill.name !== 'MMPOM') return false;
            if (name === 'COMPOSTING PLANT' && mill.name !== 'BMPOM') return false;
            return true;
        });

        for (let i = 0; i < millStations.length; i++) {
            const name = millStations[i];
            const orderIndex = i + 1; // 1-based order

            // Fuzzy Match Logic
            let station = await prisma.station.findFirst({
                where: { mill_id: mill.id, name: name }
            });

            // If not found, check aliases (previous names)
            if (!station) {
                const aliases = {
                    "THRESHING": ["Threshing"],
                    "NUT & KERNEL": ["Nut & Kernel"],
                    "CPO STORAGE TANK": ["CPO Storage"],
                    "EFFLUENT POND": ["Effluent Pond"],
                    "MILL BUILDING": ["Mill Building"],
                    "FFB RECEPTION": ["FFB Reception"],
                    "STERILIZER": ["Sterilizer"],
                    "PRESSING": ["Pressing"],
                    "CLARIFICATION": ["Clarification"],
                    "POWER PLANT": ["Power Plant"],
                    "STEAM PLANT": ["Steam Plant"],
                    "WATER TREATMENT PLANT": ["Water Treatment Plant"],
                    "KERNEL BIN STORAGE": ["Kernel Bin Storage"],
                    "WASHING PLANT": ["Washing Plant"],
                    "BIOGAS PLANT": ["Biogas Plant"],
                    "WORKSHOP": ["Workshop"],
                    "OFFICE": ["Office"]
                };

                const potentialAliases = aliases[name] || [];
                if (potentialAliases.length > 0) {
                    station = await prisma.station.findFirst({
                        where: { mill_id: mill.id, name: { in: potentialAliases } }
                    });
                }
            }

            if (station) {
                // Update Name (to UPPERCASE/Standard) and Order
                // Try-catch to handle if 'order_index' column is missing from DB (if push failed)
                try {
                    await prisma.station.update({
                        where: { id: station.id },
                        data: {
                            name: name, // Enforce strict name
                            order_index: orderIndex
                        }
                    });
                } catch (err) {
                    console.error("Error updating station (maybe schema mismatch?):", err.message);
                }
            } else {
                // Create New
                try {
                    await prisma.station.create({
                        data: {
                            name: name,
                            mill_id: mill.id,
                            order_index: orderIndex
                        }
                    });
                    console.log(`  - Created: ${name} (Order: ${orderIndex})`);
                } catch (err) {
                    console.error("Error creating station:", err.message);
                }
            }
        }
    }
    console.log('Done!');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
