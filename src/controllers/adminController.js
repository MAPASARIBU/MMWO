const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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

        res.render('layout', {
            title: 'Master Data',
            body: await renderView('admin/master', { mills }),
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
        const employees = await prisma.workshopEmployee.findMany({
            include: { mill: true },
            orderBy: [{ mill_id: 'asc' }, { name: 'asc' }]
        });
        const mills = await prisma.mill.findMany();

        res.render('layout', {
            title: 'Workshop Employees',
            body: await renderView('admin/employees', { employees, mills }),
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
