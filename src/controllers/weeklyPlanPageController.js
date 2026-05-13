const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const getWeeklyPlanPage = async (req, res) => {
    try {
        const { week, day, candidateStart, candidateEnd } = req.query;
        const user = req.session.user;
        // Default to current week logic if needed, or just let user filter

        let where = {};
        if (week) where.planned_week = week;
        if (day) where.planned_day = day;

        let categoryFilter;
        const isProcessing = req.path.includes('/processing');
        const isCivil = req.path.includes('/civil');
        
        if (isProcessing) {
            categoryFilter = 'Processing';
        } else if (isCivil) {
            categoryFilter = 'Civil';
        } else {
            categoryFilter = { notIn: ['Processing', 'Civil'] };
        }

        let woFilter = { category: categoryFilter };
        if (isProcessing || isCivil) {
            woFilter.status = { notIn: ['CLOSED', 'COMPLETED'] };
        }
        
        // Mill Isolation for Plans and Candidates
        if (user.role === 'SENIOR_MANAGER') {
            woFilter.mill_id = { in: user.accessible_mills || [] };
        } else if (user.role !== 'ADMIN') {
            woFilter.mill_id = user.mill_id;
        }

        const plans = await prisma.weeklyPlan.findMany({
            where: {
                ...where,
                wo: woFilter
            },
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

            let candidateWhere = {
                status: { notIn: ['CLOSED', 'COMPLETED'] },
                category: categoryFilter,
                OR: [
                    {
                        created_at: {
                            gte: start,
                            lte: end
                        }
                    },
                    {
                        monthly_plan_status: 'MONTHLY_DONE'
                    }
                ]
            };
            if (user.role === 'SENIOR_MANAGER') {
                candidateWhere.mill_id = { in: user.accessible_mills || [] };
            } else if (user.role !== 'ADMIN') {
                candidateWhere.mill_id = user.mill_id;
            }

            candidateWos = await prisma.workOrder.findMany({
                where: candidateWhere,
                include: {
                    station: true,
                    equipment: true,
                    weekly_plan: true
                },
                orderBy: { priority: 'asc' }
            });

            // Prioritize MONTHLY_DONE WOs to the very top
            candidateWos.sort((a, b) => {
                if (a.monthly_plan_status === 'MONTHLY_DONE' && b.monthly_plan_status !== 'MONTHLY_DONE') return -1;
                if (b.monthly_plan_status === 'MONTHLY_DONE' && a.monthly_plan_status !== 'MONTHLY_DONE') return 1;
                return 0;
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

        let empWhere = { is_active: true };
        if (user.role === 'SENIOR_MANAGER') {
            empWhere.OR = [
                { mill_id: { in: user.accessible_mills || [] } },
                { mill_id: null }
            ];
        } else if (user.role !== 'ADMIN') {
            empWhere.OR = [
                { mill_id: user.mill_id },
                { mill_id: null }
            ];
        }
        
        const workshopEmployees = await prisma.workshopEmployee.findMany({
            where: empWhere,
            orderBy: { name: 'asc' }
        });

        let stationWhere = {};
        if (user.role === 'SENIOR_MANAGER') {
            stationWhere = { mill_id: { in: user.accessible_mills || [] } };
        } else if (user.role !== 'ADMIN') {
            stationWhere = { mill_id: user.mill_id };
        }

        const stations = await prisma.station.findMany({
            where: stationWhere,
            orderBy: { name: 'asc' }
        });

        res.render('layout', {
            title: isProcessing ? 'Processing Weekly Plan' : (isCivil ? 'Civil Weekly Plan' : 'Maintenance Weekly Plan'),
            body: await renderView('weeklyPlan', {
                plans,
                candidateWos,
                query: req.query,
                currentWeek,
                workshopEmployees,
                stations,
                user,
                isProcessing,
                isCivil
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

        const isProcessing = req.path.includes('/processing');
        const isCivil = req.path.includes('/civil');
        
        let categoryFilter;
        if (isProcessing) {
            categoryFilter = 'Processing';
        } else if (isCivil) {
            categoryFilter = 'Civil';
        } else {
            categoryFilter = { notIn: ['Processing', 'Civil'] };
        }

        let woFilter = { category: categoryFilter };
        if (isProcessing || isCivil) {
            woFilter.status = { notIn: ['CLOSED', 'COMPLETED'] };
        }

        const plans = await prisma.weeklyPlan.findMany({
            where: {
                ...where,
                wo: woFilter
            },
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
            today,
            isProcessing,
            isCivil
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
