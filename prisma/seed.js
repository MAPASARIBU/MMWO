const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
    // 1. Define Mills
    const millsData = [
        { id: 1, name: 'BUNGA TANJUNG MILL', location: 'Sumatra' },
        { id: 2, name: 'MUKO MUKO MILL', location: 'Bengkulu' },
        { id: 3, name: 'BUKIT MARAJA MILL', location: 'Sumatra' },
        { id: 4, name: 'PARLABIAN MILL', location: 'Sumatra' },
        { id: 5, name: 'UMBUL MAS MILL', location: 'Sumatra' },
        { id: 6, name: 'DENDY MARKER MILL', location: 'Sumatra' },
        { id: 7, name: 'AGRO MUARA RUPIT MILL', location: 'Sumatra' }
    ];

    // 2. Define Station Names (Standard for all mills)
    const stationNames = [
        'FFB Reception',
        'Sterilizer',
        'Threshing',
        'Pressing',
        'Nut & Kernel',
        'Clarification',
        'Power Plant',
        'Steam Plant',
        'Effluent Pond',
        'Office',
        'Mill Building',
        'Workshop',
        'Water Treatment Plant',
        'Storage Bin',
        'Kernel Bin Storage',
        'CPO Storage'
    ];

    let firstMill = null;

    for (const millData of millsData) {
        // Create Mill
        const mill = await prisma.mill.upsert({
            where: { id: millData.id },
            update: { name: millData.name, location: millData.location },
            create: millData,
        });

        if (mill.id === 1) firstMill = mill;
        console.log(`Processed Mill: ${mill.name}`);

        // Create Stations for this Mill
        for (const name of stationNames) {
            // Check if station exists by name for this mill
            const existingStation = await prisma.station.findFirst({
                where: { mill_id: mill.id, name: name } // Only check name within this mill
            });

            if (existingStation) {
                continue;
            }

            let stationId;
            if (mill.id === 1) {
                // For Mill 1, try to use the original index if available (1-16)
                stationId = stationNames.indexOf(name) + 1;
                // Check if this ID is already taken
                const idCheck = await prisma.station.findUnique({ where: { id: stationId } });
                if (idCheck) {
                    // Fallback if ID 1-16 is taken
                    stationId = (mill.id * 100) + (stationNames.indexOf(name) + 1);
                }
            } else {
                // Format: (MillID * 100) + Index
                stationId = (mill.id * 100) + (stationNames.indexOf(name) + 1);
            }

            await prisma.station.upsert({
                where: { id: stationId },
                update: { name, mill_id: mill.id },
                create: {
                    id: stationId,
                    name,
                    mill_id: mill.id,
                },
            });
        }
    }

    // Get a reference station for equipment (e.g., Sterilizer)
    const station = await prisma.station.findFirst({ where: { name: 'Sterilizer' } });

    console.log({ station });

    // 3. Create Equipment
    const equipment = await prisma.equipment.create({
        data: {
            code: 'EQ-001',
            name: 'Sterilizer Door Valve',
            criticality: 'HIGH',
            station_id: station ? station.id : 1, // Fallback safe
        },
    });

    console.log({ equipment });

    // 4. Create Admin User
    const passwordHash = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: { role: 'ADMIN' },
        create: {
            username: 'admin',
            password_hash: passwordHash,
            name: 'Administrator',
            role: 'ADMIN',
            mill_id: firstMill ? firstMill.id : 1,
        },
    });

    console.log({ admin });

    // 5. Create Other Users
    const procUser = await prisma.user.upsert({
        where: { username: 'proc' },
        update: { role: 'PROC' },
        create: {
            username: 'proc',
            password_hash: await bcrypt.hash('proc123', 10),
            name: 'Processing User',
            role: 'PROC',
            mill_id: firstMill ? firstMill.id : 1,
        },
    });

    const mtcUser = await prisma.user.upsert({
        where: { username: 'mtc' },
        update: { role: 'MTC' },
        create: {
            username: 'mtc',
            password_hash: await bcrypt.hash('mtc123', 10),
            name: 'Maintenance User',
            role: 'MTC',
            mill_id: firstMill ? firstMill.id : 1,
        },
    });

    const spvUser = await prisma.user.upsert({
        where: { username: 'spv' },
        update: { role: 'SPV' },
        create: {
            username: 'spv',
            password_hash: await bcrypt.hash('spv123', 10),
            name: 'Supervisor',
            role: 'SPV',
            mill_id: firstMill ? firstMill.id : 1,
        },
    });

    const managerUser = await prisma.user.upsert({
        where: { username: 'manager' },
        update: { role: 'MANAGER' },
        create: {
            username: 'manager',
            password_hash: await bcrypt.hash('manager123', 10),
            name: 'Manager',
            role: 'MANAGER',
            mill_id: firstMill ? firstMill.id : 1,
        },
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
