const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createEmployee = async (req, res) => {
    try {
        const { mill_id, name, position } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const employee = await prisma.workshopEmployee.create({
            data: {
                mill_id: mill_id ? parseInt(mill_id) : null,
                name,
                position
            }
        });
        res.status(201).json(employee);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error creating employee' });
    }
};

const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { mill_id, name, position, is_active } = req.body;
        
        const employee = await prisma.workshopEmployee.update({
            where: { id: parseInt(id) },
            data: {
                mill_id: mill_id ? parseInt(mill_id) : null,
                name,
                position,
                is_active: is_active === undefined ? undefined : String(is_active) === 'true'
            }
        });
        res.json(employee);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error updating employee' });
    }
};

const deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.workshopEmployee.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error deleting employee. Ensure it is not linked to any Work Orders.' });
    }
};

const getEmployees = async (req, res) => {
    try {
        const { mill_id } = req.query;
        const where = { is_active: true };
        if (mill_id) {
            where.mill_id = parseInt(mill_id);
        }
        
        const employees = await prisma.workshopEmployee.findMany({
            where,
            orderBy: { name: 'asc' }
        });
        res.json(employees);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching employees' });
    }
};

module.exports = {
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getEmployees
};
