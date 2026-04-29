const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const bulkCreateEquipment = async (req, res) => {
    try {
        const { station_id, names } = req.body;

        // names is array of strings
        if (!Array.isArray(names) || names.length === 0) {
            return res.status(400).json({ error: 'Invalid names list' });
        }

        let count = 0;
        for (const name of names) {
            // Upsert by name+station (if we had unique constraint, but we don't strictly on db)
            // Just create for now, or check exist
            const exists = await prisma.equipment.findFirst({
                where: { station_id, name }
            });

            if (!exists) {
                // Generate a code - simple auto increment style logic or random
                // For bulk, let's just use simplified code or timestamp suffix if collision
                const countExisting = await prisma.equipment.count({ where: { station_id } });
                const code = `EQ-${station_id}-${Date.now().toString().slice(-4)}-${countExisting + count + 1}`;

                await prisma.equipment.create({
                    data: {
                        station_id,
                        name,
                        code,
                        criticality: 'MED' // Default
                    }
                });
                count++;
            }
        }

        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const updateEquipment = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        const updated = await prisma.equipment.update({
            where: { id: parseInt(id) },
            data: { name: name.trim() }
        });
        
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update equipment' });
    }
};

const deleteEquipment = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Also check if there are WOs related to this equipment before deleting
        const wos = await prisma.workOrder.count({ where: { equipment_id: parseInt(id) } });
        if (wos > 0) {
            return res.status(400).json({ error: 'Cannot delete equipment. There are Work Orders attached to it.' });
        }
        
        await prisma.equipment.delete({
            where: { id: parseInt(id) }
        });
        
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete equipment' });
    }
};

module.exports = {
    bulkCreateEquipment,
    updateEquipment,
    deleteEquipment
};
