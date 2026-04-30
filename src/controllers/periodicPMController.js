const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getPeriodicPMs = async (req, res) => {
    try {
        const equipmentId = parseInt(req.params.equipmentId);
        const pms = await prisma.periodicPM.findMany({
            where: { equipment_id: equipmentId },
            orderBy: { created_at: 'desc' }
        });
        res.json(pms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const createPeriodicPM = async (req, res) => {
    try {
        const equipmentId = parseInt(req.params.equipmentId);
        const { name, interval_type, interval_value, category, priority, next_due_date } = req.body;

        const pm = await prisma.periodicPM.create({
            data: {
                equipment_id: equipmentId,
                name,
                interval_type,
                interval_value: parseInt(interval_value),
                category: category || 'Mechanical',
                priority: priority || 'P3',
                next_due_date: new Date(next_due_date),
                is_active: true
            }
        });
        res.status(201).json(pm);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const editPeriodicPM = async (req, res) => {
    try {
        const pmId = parseInt(req.params.pmId);
        const { name, interval_type, interval_value, category, priority, next_due_date, is_active } = req.body;
        
        const updateData = {
            name,
            interval_type,
            interval_value: parseInt(interval_value),
            category,
            priority,
            next_due_date: new Date(next_due_date)
        };
        
        if (is_active !== undefined) {
            updateData.is_active = is_active === 'true' || is_active === true;
        }

        const pm = await prisma.periodicPM.update({
            where: { id: pmId },
            data: updateData
        });
        res.json(pm);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const deletePeriodicPM = async (req, res) => {
    try {
        const pmId = parseInt(req.params.pmId);
        await prisma.periodicPM.delete({
            where: { id: pmId }
        });
        res.json({ success: true, message: 'PM Plan deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getPeriodicPMs,
    createPeriodicPM,
    editPeriodicPM,
    deletePeriodicPM
};
