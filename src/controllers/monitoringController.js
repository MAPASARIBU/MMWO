const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const getMonitoringPage = async (req, res) => {
    try {
        const user = req.session.user || req.user;
        let { startDate } = req.query;
        const type = req.params.type || 'MAINTENANCE'; // Default to MAINTENANCE

        // Default to 3 days ago if no startDate provided
        let start = new Date();
        if (startDate) {
            start = new Date(startDate);
        } else {
            start.setDate(start.getDate() - 3);
        }
        
        // Reset time to start of day
        start.setHours(0, 0, 0, 0);

        // Generate 30 days array
        const dates = [];
        for (let i = 0; i < 30; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            dates.push(d);
        }

        const windowStart = dates[0];
        const windowEnd = new Date(dates[dates.length - 1]);
        windowEnd.setHours(23, 59, 59, 999);

        // Filter by user role/mill
        let where = {};
        if (user.role === 'SENIOR_MANAGER') {
            where.mill_id = { in: user.accessible_mills || [] };
        } else if (user.role !== 'ADMIN') {
            where.mill_id = user.mill_id;
        }

        // Fetch WOs overlapping with the window
        // Condition: created_at <= windowEnd AND (completed_at == null OR completed_at >= windowStart)
        where.created_at = { lte: windowEnd };
        where.OR = [
            { completed_at: null },
            { completed_at: { gte: windowStart } },
            { closed_at: { gte: windowStart } }
        ];

        // Filter by WO type
        if (type.toUpperCase() === 'PROCESSING') {
            where.type = 'Processing';
        } else {
            where.type = { not: 'Processing' };
        }

        const wos = await prisma.workOrder.findMany({
            where,
            include: {
                station: true,
                assignee: true,
                pics: true
            },
            orderBy: [
                { status: 'asc' },
                { created_at: 'desc' }
            ]
        });

        // Filter WOs to only those that have a visible block (Target or Actual) in this 14-day window
        const filteredWos = wos.filter(wo => {
            // Determine Target range
            const targetStart = new Date(wo.created_at);
            targetStart.setHours(0,0,0,0);
            const targetFinish = wo.target_finish ? new Date(wo.target_finish) : new Date(targetStart);
            targetFinish.setHours(23,59,59,999);

            const hasTarget = targetStart <= windowEnd && targetFinish >= windowStart;

            // Determine Actual range
            let hasActual = false;
            if (wo.started_at) {
                const actualStart = new Date(wo.started_at);
                actualStart.setHours(0,0,0,0);
                let actualFinish = new Date();
                if (wo.completed_at) {
                    actualFinish = new Date(wo.completed_at);
                } else if (wo.closed_at) {
                    actualFinish = new Date(wo.closed_at);
                } else if (wo.status !== 'CLOSED' && wo.status !== 'COMPLETED') {
                    actualFinish = new Date(); // Ongoing
                } else {
                    actualFinish = new Date(actualStart);
                }
                actualFinish.setHours(23,59,59,999);

                hasActual = actualStart <= windowEnd && actualFinish >= windowStart;
            }

            return hasTarget || hasActual;
        });

        // Format dates for the view
        const formattedDates = dates.map(d => {
            return {
                date: d,
                dayStr: d.getDate(),
                monthStr: d.toLocaleDateString('id-ID', { month: 'short' }).toUpperCase()
            };
        });

        const title = type.toUpperCase() === 'PROCESSING' ? 'Monitoring Realisasi Processing' : 'Monitoring Realisasi Maintenance';

        res.render('layout', {
            title: title,
            body: await renderView('monitoring/index', { 
                wos: filteredWos, 
                dates: formattedDates, 
                startDateStr: windowStart.toISOString().split('T')[0],
                user,
                type: type.toUpperCase()
            }),
            user,
            path: `/monitoring/${type.toLowerCase()}`
        });
    } catch (error) {
        console.error('Error fetching monitoring page:', error);
        res.status(500).send('Error loading monitoring page');
    }
};

module.exports = {
    getMonitoringPage
};
