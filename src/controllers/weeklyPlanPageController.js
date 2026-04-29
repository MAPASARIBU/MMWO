const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const getWeeklyPlanPage = async (req, res) => {
    try {
        const { week, day, candidateStart, candidateEnd } = req.query;
        // Default to current week logic if needed, or just let user filter

        let where = {};
        if (week) where.planned_week = week;
        if (day) where.planned_day = day;

        const plans = await prisma.weeklyPlan.findMany({
            where,
            include: {
                wo: {
                    include: {
                        mill: true,
                        station: true,
                        equipment: true,
                        pics: true
                    }
                },
                planner: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' }
        });

        // Candidate WOs Query
        let candidateWos = [];
        if (candidateStart && candidateEnd) {
            const start = new Date(candidateStart);
            const end = new Date(candidateEnd);
            end.setHours(23, 59, 59, 999);

            candidateWos = await prisma.workOrder.findMany({
                where: {
                    status: { notIn: ['CLOSED', 'COMPLETED'] },
                    created_at: {
                        gte: start,
                        lte: end
                    }
                },
                include: {
                    station: true,
                    equipment: true,
                    weekly_plan: true
                },
                orderBy: { priority: 'asc' }
            });
        }

        // Helper to get current ISO Week string (YYYY-W##)
        const getISOWeekString = (date) => {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const year = d.getUTCFullYear();
            const weekNo = Math.ceil((((d - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
            return `${year}-W${String(weekNo).padStart(2, '0')}`;
        };

        const currentWeek = getISOWeekString(new Date());

        const user = req.session.user;
        let empWhere = { is_active: true };
        if (user.role !== 'ADMIN') {
            empWhere.OR = [
                { mill_id: user.mill_id },
                { mill_id: null }
            ];
        }
        
        const workshopEmployees = await prisma.workshopEmployee.findMany({
            where: empWhere,
            orderBy: { name: 'asc' }
        });

        res.render('layout', {
            title: 'Weekly Plan',
            body: await renderView('weeklyPlan', {
                plans,
                candidateWos,
                query: req.query,
                currentWeek,
                workshopEmployees,
                user
            }),
            user: req.session.user,
            path: '/weekly-plan'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading weekly plan');
    }
};

const getWeeklyPlanPrint = async (req, res) => {
    try {
        const { week, day } = req.query;
        let where = {};
        if (week) where.planned_week = week;
        if (day) where.planned_day = day;

        const plans = await prisma.weeklyPlan.findMany({
            where,
            include: {
                wo: {
                    include: {
                        mill: true,
                        station: true,
                        equipment: true,
                        pics: true
                    }
                },
                planner: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' }
        });

        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Group plans by category
        const groupedPlans = {};
        plans.forEach(plan => {
            const category = plan.wo.category || 'Uncategorized';
            if (!groupedPlans[category]) {
                groupedPlans[category] = [];
            }
            groupedPlans[category].push(plan);
        });

        // Sort each category's plans by station name
        for (const cat in groupedPlans) {
            groupedPlans[cat].sort((a, b) => {
                const statA = a.wo.station ? a.wo.station.name : 'Z';
                const statB = b.wo.station ? b.wo.station.name : 'Z';
                return statA.localeCompare(statB);
            });
        }

        res.render('weekly_plan_print', {
            groupedPlans,
            query: req.query,
            user: req.session.user,
            today
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading weekly plan print view');
    }
};

module.exports = {
    getWeeklyPlanPage,
    getWeeklyPlanPrint
};
