const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const listWorkOrders = async (req, res) => {
    try {
        const { status, priority, category, date } = req.query;
        const user = req.session.user;

        // Determine Mill Context
        let targetMillId = null;
        if (user.role === 'ADMIN') {
            targetMillId = user.current_mill_id || null;
        } else {
            targetMillId = user.mill_id;
        }

        const where = {};
        if (status) where.status = status;
        if (priority) where.priority = priority;
        if (category) where.category = category;

        // Date Filter (Daily)
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            where.created_at = {
                gte: startDate,
                lte: endDate
            };
        }

        // Apply Mill Filter
        if (targetMillId) {
            where.mill_id = targetMillId;
        }

        // Fetch Data
        const wos = await prisma.workOrder.findMany({
            where,
            include: {
                station: true,
                equipment: true,
                assignee: true,
                reporter: true
            },
            orderBy: { created_at: 'desc' }
        });

        res.render('layout', {
            title: 'Work Orders',
            body: await renderView('wo/list', { wos, query: req.query }),
            user: req.session.user,
            path: '/work-orders'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading work orders');
    }
};

const createWorkOrderPage = async (req, res) => {
    try {
        const user = req.session.user;
        let mills = [];

        // Admin gets all mills, User gets only their own
        if (user.role === 'ADMIN') {
            // If admin has a current_mill_id, maybe default/restrict? 
            // Usually Admin creates for any, but "making for specific mill" is safer.
            // Let's load ALL for admin.
            mills = await prisma.mill.findMany({ include: { stations: true } });
        } else {
            mills = await prisma.mill.findMany({
                where: { id: user.mill_id },
                include: { stations: true }
            });
        }

        const stations = await prisma.station.findMany(); // Optimization: could filter by mill too

        res.render('layout', {
            title: 'Create Work Order',
            body: await renderView('wo/create', { mills, stations }),
            user: req.session.user,
            path: '/work-orders/create'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading create page');
    }
};

const detailWorkOrderPage = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.session.user;

        const wo = await prisma.workOrder.findUnique({
            where: { id: parseInt(id) },
            include: {
                mill: true,
                station: true,
                equipment: true,
                assignee: true,
                reporter: true,
                attachments: true,
                comments: { include: { user: true }, orderBy: { created_at: 'asc' } },
                audit_logs: { include: { user: true }, orderBy: { created_at: 'desc' } }
            }
        });

        if (!wo) return res.status(404).send('WO Not Found');

        // ACCESS CONTROL Check
        // If not admin, and wo.mill_id != user.mill_id -> Forbidden
        if (user.role !== 'ADMIN' && wo.mill_id !== user.mill_id) {
            return res.status(403).send('Access Denied: You cannot view Work Orders from another mill.');
        }

        const users = await prisma.user.findMany({ where: { role: 'MTC', is_active: true } });

        res.render('layout', {
            title: wo.wo_no,
            body: await renderView('wo/detail', { wo, mtcUsers: users }),
            user: req.session.user,
            path: '/work-orders'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading details');
    }
};

// Print recap of all work orders (print-friendly view)
const printWORecap = async (req, res) => {
    try {
        const user = req.session.user;
        let targetMillId = null;

        if (user.role === 'ADMIN') {
            targetMillId = user.current_mill_id;
        } else {
            targetMillId = user.mill_id;
        }

        const where = {};
        if (targetMillId) where.mill_id = targetMillId;

        const wos = await prisma.workOrder.findMany({
            where,
            include: { station: true, equipment: true, assignee: true, reporter: true }
        });
        res.render('layout', {
            title: 'Work Order Recap',
            body: await renderView('wo/print', { wos }),
            user: req.session.user,
            path: '/work-orders/print'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading print recap');
    }
};

module.exports = {
    listWorkOrders,
    createWorkOrderPage,
    detailWorkOrderPage,
    printWORecap
};
