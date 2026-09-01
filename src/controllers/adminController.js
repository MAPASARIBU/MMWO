const prisma = require('../prisma');
const { renderView } = require('./indexController');

const getUsersPage = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            include: { mill: true },
            orderBy: { created_at: 'desc' }
        });
        const mills = await prisma.mill.findMany();

        res.render('layout', {
            title: 'User Management',
            body: await renderView('admin/users', { users, mills }),
            user: req.session.user,
            path: '/admin/users'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading users page');
    }
};

const getMasterDataPage = async (req, res) => {
    try {
        // Fetch Mills with their Stations to allow hierarchical view
        const mills = await prisma.mill.findMany({
            include: {
                stations: {
                    include: {
                        equipment: {
                            orderBy: { name: 'asc' }
                        }
                    },
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: { name: 'asc' }
        });

        const processingPlans = await prisma.processingPlan.findMany({
            include: { mill: true, station: true, equipment: true },
            orderBy: { created_at: 'desc' }
        });

        const officePlans = await prisma.officePlan.findMany({
            include: { mill: true, station: true },
            orderBy: { created_at: 'desc' }
        });

        res.render('layout', {
            title: 'Master Data',
            body: await renderView('admin/master', { mills, processingPlans, officePlans, user: req.session.user }),
            user: req.session.user,
            path: '/admin/master'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading master data');
    }
};

const getEmployeesPage = async (req, res) => {
    try {
        const user = req.session.user;
        const activeMillId = user ? (user.current_mill_id || user.mill_id) : null;

        let empWhere = {};
        let stationWhere = {};

        if (user.role === 'SENIOR_MANAGER') {
            if (activeMillId) {
                empWhere.OR = [{ mill_id: activeMillId }, { mill_id: null }];
                stationWhere.mill_id = activeMillId;
            } else if (user.accessible_mills && user.accessible_mills.length > 0) {
                empWhere.OR = [
                    { mill_id: { in: user.accessible_mills } },
                    { mill_id: null }
                ];
                stationWhere.mill_id = { in: user.accessible_mills };
            }
        } else if (user.role !== 'ADMIN') {
            if (activeMillId) {
                empWhere.OR = [
                    { mill_id: activeMillId },
                    { mill_id: null }
                ];
                stationWhere.mill_id = activeMillId;
            }
        } else {
            if (activeMillId) {
                empWhere.OR = [
                    { mill_id: activeMillId },
                    { mill_id: null }
                ];
                stationWhere.mill_id = activeMillId;
            }
        }

        const employees = await prisma.workshopEmployee.findMany({
            where: empWhere,
            include: { mill: true },
            orderBy: [{ mill_id: 'asc' }, { name: 'asc' }]
        });
        const mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } });
        const stations = await prisma.station.findMany({
            where: stationWhere,
            orderBy: { name: 'asc' }
        });

        res.render('layout', {
            title: 'Master Labour Employees',
            body: await renderView('admin/employees', { employees, mills, stations, user: req.session.user }),
            user: req.session.user,
            path: '/admin/employees'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading employees page');
    }
};

module.exports = {
    getUsersPage,
    getMasterDataPage,
    getEmployeesPage
};
