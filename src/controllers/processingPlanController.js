const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');
const { generateWONumber } = require('./workOrderController');
const { calculateNextDueDate } = require('../cron/processingCron');

// Helper to get current ISO Week string (YYYY-W##)
const getISOWeekString = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const year = d.getUTCFullYear();
    const weekNo = Math.ceil((((d - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
};

const getProcessingPlansPage = async (req, res) => {
    try {
        const user = req.session.user;
        let where = {};
        
        if (user.role === 'SENIOR_MANAGER') {
            where.mill_id = { in: user.accessible_mills || [] };
        } else if (user.role !== 'ADMIN') {
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
        
        let stationWhere = {};
        if (user.role === 'SENIOR_MANAGER') {
            stationWhere = { mill_id: { in: user.accessible_mills || [] } };
        } else if (user.role !== 'ADMIN') {
            stationWhere = { mill_id: user.mill_id };
        }

        const stations = await prisma.station.findMany({
            where: stationWhere
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

const bulkCreateProcessingWOs = async (req, res) => {
    try {
        const { plan_ids } = req.body;
        const user = req.session.user || req.user;

        if (!plan_ids || !Array.isArray(plan_ids) || plan_ids.length === 0) {
            return res.status(400).json({ error: 'No Processing Plans selected' });
        }

        const plans = await prisma.processingPlan.findMany({
            where: { id: { in: plan_ids.map(id => parseInt(id)) } },
            include: { station: true }
        });

        const createdWos = [];
        const now = new Date();
        const currentWeek = getISOWeekString(now);

        for (const plan of plans) {
            const wo_no = await generateWONumber();
            const description = `[MANUAL PROCESSING] ${plan.name}\nGenerated manually from Processing Plan Dashboard Widget.`;

            const wo = await prisma.workOrder.create({
                data: {
                    wo_no,
                    mill_id: plan.mill_id,
                    station_id: plan.station_id,
                    category: 'Processing',
                    type: 'Processing',
                    priority: 'P2',
                    description,
                    status: 'OPEN',
                    reporter_id: user.id,
                }
            });

            await prisma.auditLog.create({
                data: {
                    wo_id: wo.id,
                    user_id: user.id,
                    action: 'CREATED',
                    new_value: 'OPEN'
                }
            });

            await prisma.weeklyPlan.create({
                data: {
                    wo_id: wo.id,
                    planned_week: currentWeek,
                    planned_day: 'Monday',
                    planned_by: user.id
                }
            });

            createdWos.push(wo);

            const nextDue = calculateNextDueDate(now, plan.interval_type, plan.interval_value);
            await prisma.processingPlan.update({
                where: { id: plan.id },
                data: {
                    last_generated: now,
                    next_due_date: nextDue
                }
            });
        }

        res.status(201).json({ success: true, count: createdWos.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getProcessingPlansPage,
    createProcessingPlan,
    editProcessingPlan,
    deleteProcessingPlan,
    bulkCreateProcessingWOs
};
