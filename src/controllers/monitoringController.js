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

        // Generate 14 days array
        const dates = [];
        for (let i = 0; i < 14; i++) {
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
                wos, 
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
