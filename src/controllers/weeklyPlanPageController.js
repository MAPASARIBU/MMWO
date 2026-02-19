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
                        equipment: true
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
                    status: { not: 'CLOSED' },
                    weekly_plan: null, // Only fetch those NOT yet planned
                    created_at: {
                        gte: start,
                        lte: end
                    }
                },
                include: {
                    station: true,
                    equipment: true
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

        res.render('layout', {
            title: 'Weekly Plan',
            body: await renderView('weeklyPlan', {
                plans,
                candidateWos,
                query: req.query,
                currentWeek
            }),
            user: req.session.user,
            path: '/weekly-plan'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading weekly plan');
    }
};

module.exports = {
    getWeeklyPlanPage
};
