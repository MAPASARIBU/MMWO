const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
    // 1. Create Mills
    const mill = await prisma.mill.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'BUNGA TANJUNG MILL',
            location: 'Sumatra',
        },
    });

    console.log({ mill });

    // 2. Create Stations
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

    for (const name of stationNames) {
        await prisma.station.upsert({
            where: { id: stationNames.indexOf(name) + 1 }, // Simple ID strategy for seed
            update: { name },
            create: {
                name,
                mill_id: mill.id,
            },
        });
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
            station_id: station.id,
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
            mill_id: mill.id,
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
            mill_id: mill.id,
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
            mill_id: mill.id,
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
            mill_id: mill.id,
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
            mill_id: mill.id,
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
