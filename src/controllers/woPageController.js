const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const listWorkOrders = async (req, res) => {
    try {
        const { status, priority, category, startDate, endDate, station_id } = req.query;
        const user = req.session.user;
        const queryToView = { ...req.query };
        const isInitialLoad = Object.keys(req.query).length === 0;

        // Determine Mill Context
        let targetMillId = null;
        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
            targetMillId = user.current_mill_id || null;
        } else {
            targetMillId = user.mill_id;
        }

        const where = {};
        if (status) {
            where.status = status;
        } else {
            // Hide CLOSED and COMPLETED work orders by default unless explicitly filtered
            where.status = { notIn: ['CLOSED', 'COMPLETED'] };
        }
        
        where.category = { not: 'Processing' };
        if (priority) where.priority = priority;
        if (category) where.category = category;

        // Date Filter (Range)
        let actualStartDate = startDate;
        let actualEndDate = endDate;

        if (isInitialLoad) {
            // Default to 1 month ago
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            actualStartDate = oneMonthAgo.toISOString().split('T')[0];
            queryToView.startDate = actualStartDate;
        }

        if (actualStartDate || actualEndDate) {
            where.created_at = {};
            if (actualStartDate) {
                where.created_at.gte = new Date(actualStartDate);
            }
            if (actualEndDate) {
                const end = new Date(actualEndDate);
                end.setHours(23, 59, 59, 999);
                where.created_at.lte = end;
            }
        }

        // Station filter
        if (station_id) {
            where.station_id = parseInt(station_id);
        }

        // Apply Mill Filter
        if (targetMillId) {
            where.mill_id = targetMillId;
        } else if (user.role === 'SENIOR_MANAGER') {
            where.mill_id = { in: user.accessible_mills || [] };
        }

        // Fetch Data
        const wos = await prisma.workOrder.findMany({
            where,
            include: {
                station: true,
                equipment: true,
                parts: true,
                assignee: true,
                reporter: true
            },
            orderBy: { created_at: 'desc' }
        });

        // Fetch stations for the filter dropdown
        let stationWhere = {};
        if (targetMillId) {
            stationWhere.mill_id = targetMillId;
        } else if (user.role === 'SENIOR_MANAGER') {
            stationWhere.mill_id = { in: user.accessible_mills || [] };
        }
        const stations = await prisma.station.findMany({
            where: stationWhere,
            orderBy: { name: 'asc' }
        });

        res.render('layout', {
            title: 'Work Orders',
            body: await renderView('wo/list', { wos, query: queryToView, user, stations }),
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

        // Admin gets all mills, Senior Manager gets accessible mills, User gets only their own
        if (user.role === 'ADMIN') {
            mills = await prisma.mill.findMany({ include: { stations: true } });
        } else if (user.role === 'SENIOR_MANAGER') {
            mills = await prisma.mill.findMany({ 
                where: { id: { in: user.accessible_mills || [] } },
                include: { stations: true } 
            });
        } else {
            mills = await prisma.mill.findMany({
                where: { id: user.mill_id },
                include: { stations: true }
            });
        }

        const stations = await prisma.station.findMany(); // Optimization: could filter by mill too

        let prefillPart = null;
        if (req.query.part_id) {
            prefillPart = await prisma.part.findUnique({
                where: { id: parseInt(req.query.part_id) },
                include: {
                    equipment: {
                        include: { station: true }
                    }
                }
            });
        }

        res.render('layout', {
            title: 'Create Work Order',
            body: await renderView('wo/create', { mills, stations, prefillPart }),
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
                parts: true,
                pics: true,
                assignee: true,
                reporter: true,
                attachments: true,
                materials: true,
                comments: { include: { user: true }, orderBy: { created_at: 'asc' } },
                audit_logs: { include: { user: true }, orderBy: { created_at: 'desc' } }
            }
        });

        if (!wo) return res.status(404).send('WO Not Found');

        // ACCESS CONTROL Check
        // If not admin/senior manager, and wo.mill_id != user.mill_id -> Forbidden
        if (user.role !== 'ADMIN' && user.role !== 'SENIOR_MANAGER' && wo.mill_id !== user.mill_id) {
            return res.status(403).send('Access Denied: You cannot view Work Orders from another mill.');
        }

        const users = await prisma.user.findMany({ 
            where: { 
                role: { in: ['MTC', 'PROC', 'SPV', 'OAA'] }, 
                is_active: true,
                OR: [{ mill_id: wo.mill_id }, { mill_id: null }]
            }, 
            orderBy: { name: 'asc' } 
        });
        let empWhere = { is_active: true, OR: [{ mill_id: wo.mill_id }, { mill_id: null }] };
        if (wo.category === 'Processing') {
            empWhere.department = { in: ['Processing Employees I', 'Processing Employees II'] };
        } else {
            empWhere.department = 'Workshop Employees';
        }

        const workshopEmployees = await prisma.workshopEmployee.findMany({
            where: empWhere,
            orderBy: { name: 'asc' }
        });

        res.render('layout', {
            title: wo.wo_no,
            body: await renderView('wo/detail', { wo, mtcUsers: users, workshopEmployees, user, readonly: req.query.readonly === 'true' }),
            user: req.session.user,
            path: '/work-orders'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading details: ' + error.message + '<br><pre>' + error.stack + '</pre>');
    }
};

// Print recap of all work orders (print-friendly view)
const printWORecap = async (req, res) => {
    try {
        const user = req.session.user;
        let targetMillId = null;

        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
            targetMillId = user.current_mill_id;
        } else {
            targetMillId = user.mill_id;
        }

        const where = {
            category: { not: 'Processing' }
        };
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
