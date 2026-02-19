const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- Mill ---
const getMills = async (req, res) => {
    try {
        const mills = await prisma.mill.findMany();
        res.json(mills);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createMill = async (req, res) => {
    try {
        const { name, location } = req.body;
        const mill = await prisma.mill.create({
            data: { name, location }
        });
        res.status(201).json(mill);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Station ---
const getStations = async (req, res) => {
    try {
        const { mill_id } = req.query;
        const where = mill_id ? { mill_id: parseInt(mill_id) } : {};
        const stations = await prisma.station.findMany({
            where,
            include: { mill: true }
        });
        res.json(stations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createStation = async (req, res) => {
    try {
        const { mill_id, name } = req.body;
        const station = await prisma.station.create({
            data: {
                mill_id: parseInt(mill_id),
                name
            }
        });
        res.status(201).json(station);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Equipment ---
const getEquipment = async (req, res) => {
    try {
        const { station_id } = req.query;
        const where = station_id ? { station_id: parseInt(station_id) } : {};
        const equipment = await prisma.equipment.findMany({
            where,
            include: { station: true }
        });
        res.json(equipment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createEquipment = async (req, res) => {
    try {
        const { station_id, code, name, criticality } = req.body;
        const equipment = await prisma.equipment.create({
            data: {
                station_id: parseInt(station_id),
                code,
                name,
                criticality, // LOW, MED, HIGH
                is_active: true
            }
        });
        res.status(201).json(equipment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getMills,
    createMill,
    getStations,
    createStation,
    getEquipment,
    createEquipment
};
