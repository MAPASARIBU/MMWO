const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const getMonthlyPlanPage = async (req, res) => {
    try {
        const user = req.session.user;
        let targetMillId = null;

        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
            targetMillId = user.current_mill_id || null;
        } else {
            targetMillId = user.mill_id;
        }

        const where = {
            monthly_plan_status: 'MONTHLY',
            status: { notIn: ['CLOSED', 'COMPLETED'] }
        };

        // Apply Mill Filter
        if (targetMillId) {
            where.mill_id = targetMillId;
        } else if (user.role === 'SENIOR_MANAGER') {
            where.mill_id = { in: user.accessible_mills || [] };
        }

        const wos = await prisma.workOrder.findMany({
            where,
            include: {
                station: true,
                equipment: true,
                assignee: true,
                reporter: true,
                monthly_materials: true
            },
            orderBy: { created_at: 'desc' }
        });

        const { startDate, endDate } = req.query;

        // Fetch Historical Monthly Plan WOs
        let historicalWhere = {
            monthly_plan_status: 'MONTHLY_DONE',
            status: { notIn: ['CLOSED', 'COMPLETED'] }
        };

        if (targetMillId) {
            historicalWhere.mill_id = targetMillId;
        } else if (user.role === 'SENIOR_MANAGER') {
            historicalWhere.mill_id = { in: user.accessible_mills || [] };
        }

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            historicalWhere.created_at = { gte: start, lte: end };
        }

        const historicalWos = await prisma.workOrder.findMany({
            where: historicalWhere,
            include: {
                station: true,
                monthly_materials: true
            },
            orderBy: { created_at: 'desc' }
        });

        res.render('layout', {
            title: 'Monthly Plan',
            body: await renderView('monthlyPlan', { wos, historicalWos, query: req.query, user }),
            user: req.session.user,
            path: '/monthly-plan'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading monthly plan');
    }
};

// API: Set Monthly Plan Status
const setMonthlyPlanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'MONTHLY' or 'NO'
        
        if (!['MONTHLY', 'NO'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const wo = await prisma.workOrder.update({
            where: { id: parseInt(id) },
            data: { monthly_plan_status: status }
        });

        res.json({ success: true, wo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update monthly plan status' });
    }
};

// API: Add Material
const addMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const { material_name, quantity } = req.body;

        const material = await prisma.monthlyPlanMaterial.create({
            data: {
                wo_id: parseInt(id),
                material_name,
                quantity: parseInt(quantity) || 1
            }
        });

        res.json({ success: true, material });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add material' });
    }
};

// API: Delete Material
const deleteMaterial = async (req, res) => {
    try {
        const { material_id } = req.params;
        await prisma.monthlyPlanMaterial.delete({
            where: { id: parseInt(material_id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete material' });
    }
};

// API: Toggle Material Complete
const toggleMaterialComplete = async (req, res) => {
    try {
        const { id, material_id } = req.params;
        const { is_complete } = req.body;

        await prisma.monthlyPlanMaterial.update({
            where: { id: parseInt(material_id) },
            data: { is_complete: is_complete === true || is_complete === 'true' }
        });

        // Check if all materials are complete
        const allMaterials = await prisma.monthlyPlanMaterial.findMany({
            where: { wo_id: parseInt(id) }
        });

        const allComplete = allMaterials.length > 0 && allMaterials.every(m => m.is_complete);

        if (allComplete) {
            await prisma.workOrder.update({
                where: { id: parseInt(id) },
                data: { monthly_plan_status: 'MONTHLY_DONE' }
            });
            return res.json({ success: true, allComplete: true });
        }

        res.json({ success: true, allComplete: false });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update material status' });
    }
};

module.exports = {
    getMonthlyPlanPage,
    setMonthlyPlanStatus,
    addMaterial,
    deleteMaterial,
    toggleMaterialComplete
};
