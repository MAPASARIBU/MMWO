const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getParts = async (req, res) => {
    try {
        const equipmentId = parseInt(req.params.equipmentId);
        const parts = await prisma.part.findMany({
            where: { equipment_id: equipmentId },
            orderBy: { installed_at: 'desc' }
        });
        res.json(parts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const createPart = async (req, res) => {
    try {
        const equipmentId = parseInt(req.params.equipmentId);
        const { name, lifetime_hm } = req.body;

        const part = await prisma.part.create({
            data: {
                equipment_id: equipmentId,
                name,
                lifetime_hm: parseFloat(lifetime_hm),
                current_hm: 0,
                is_active: true
            }
        });
        res.json(part);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const replacePart = async (req, res) => {
    try {
        const partId = parseInt(req.params.partId);
        const { new_name, lifetime_hm } = req.body;
        
        // Find existing part
        const oldPart = await prisma.part.findUnique({ where: { id: partId } });
        if (!oldPart) return res.status(404).json({ error: 'Part not found' });

        // Deactivate old part
        await prisma.part.update({
            where: { id: partId },
            data: {
                is_active: false,
                replaced_at: new Date()
            }
        });

        // Create new part
        const newPart = await prisma.part.create({
            data: {
                equipment_id: oldPart.equipment_id,
                name: new_name || oldPart.name,
                lifetime_hm: parseFloat(lifetime_hm || oldPart.lifetime_hm),
                current_hm: 0,
                is_active: true
            }
        });

        res.json({ oldPart, newPart });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const getHMRecords = async (req, res) => {
    try {
        const equipmentId = parseInt(req.params.equipmentId);
        const records = await prisma.hMRecord.findMany({
            where: { equipment_id: equipmentId },
            orderBy: { record_date: 'desc' }
        });
        res.json(records);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const recordHM = async (req, res) => {
    try {
        const equipmentId = parseInt(req.params.equipmentId);
        const { record_date, hm_value } = req.body;
        const userId = req.session?.user?.id;

        const hmValueFloat = parseFloat(hm_value);
        if (isNaN(hmValueFloat) || hmValueFloat <= 0) {
            return res.status(400).json({ error: 'Invalid HM value' });
        }

        // 1. Create HM Record
        const record = await prisma.hMRecord.create({
            data: {
                equipment_id: equipmentId,
                record_date: new Date(record_date),
                hm_value: hmValueFloat,
                recorded_by: userId
            }
        });

        // 2. Update all ACTIVE parts for this equipment
        await prisma.part.updateMany({
            where: {
                equipment_id: equipmentId,
                is_active: true
            },
            data: {
                current_hm: {
                    increment: hmValueFloat
                }
            }
        });

        res.json({ success: true, record });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const editPart = async (req, res) => {
    try {
        const partId = parseInt(req.params.partId);
        const { name, lifetime_hm, current_hm } = req.body;
        
        const updatedPart = await prisma.part.update({
            where: { id: partId },
            data: {
                name,
                lifetime_hm: parseFloat(lifetime_hm),
                current_hm: parseFloat(current_hm)
            }
        });
        res.json(updatedPart);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const deletePart = async (req, res) => {
    try {
        const partId = parseInt(req.params.partId);

        // Check if part is used in work orders (if any relationships exist depending on schema rules)
        // Note: Prisma might throw an error automatically if foreign keys restrict deletion
        await prisma.part.delete({
            where: { id: partId }
        });
        
        res.json({ success: true, message: 'Part deleted successfully' });
    } catch (error) {
        console.error(error);
        if (error.code === 'P2003') {
            return res.status(400).json({ error: 'Cannot delete part because it is referenced in other records (like Work Orders). Please just replace it to make it inactive.' });
        }
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getParts,
    createPart,
    replacePart,
    getHMRecords,
    recordHM,
    editPart,
    deletePart
};
