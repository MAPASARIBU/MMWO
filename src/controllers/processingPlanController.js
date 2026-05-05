const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const getProcessingPlansPage = async (req, res) => {
    try {
        const user = req.session.user;
        let where = {};
        
        if (user.role !== 'ADMIN') {
            where.mill_id = user.mill_id;
        }

        const plans = await prisma.processingPlan.findMany({
            where,
            include: {
                mill: true,
                station: true
            },
            orderBy: { created_at: 'desc' }
        });

        const mills = await prisma.mill.findMany();
        const stations = await prisma.station.findMany({
            where: user.role !== 'ADMIN' ? { mill_id: user.mill_id } : {}
        });

        res.render('layout', {
            title: 'Processing Plans Schedule',
            body: await renderView('admin/processing_plans', { plans, mills, stations, user }),
            user: req.session.user,
            path: '/processing-plans'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading processing plans');
    }
};

const createProcessingPlan = async (req, res) => {
    try {
        const { mill_id, station_id, name, interval_type, interval_value, next_due_date } = req.body;

        const plan = await prisma.processingPlan.create({
            data: {
                mill_id: parseInt(mill_id),
                station_id: parseInt(station_id),
                name,
                interval_type,
                interval_value: parseInt(interval_value) || 1,
                next_due_date: new Date(next_due_date),
                is_active: true
            }
        });
        res.status(201).json(plan);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const editProcessingPlan = async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const { mill_id, station_id, name, interval_type, interval_value, next_due_date, is_active } = req.body;
        
        const updateData = {
            mill_id: parseInt(mill_id),
            station_id: parseInt(station_id),
            name,
            interval_type,
            interval_value: parseInt(interval_value) || 1,
            next_due_date: new Date(next_due_date)
        };
        
        if (is_active !== undefined) {
            updateData.is_active = is_active === 'true' || is_active === true;
        }

        const plan = await prisma.processingPlan.update({
            where: { id: planId },
            data: updateData
        });
        res.json(plan);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const deleteProcessingPlan = async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        await prisma.processingPlan.delete({
            where: { id: planId }
        });
        res.json({ success: true, message: 'Processing Plan deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getProcessingPlansPage,
    createProcessingPlan,
    editProcessingPlan,
    deleteProcessingPlan
};
