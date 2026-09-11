const prisma = require('../prisma');
const { renderView } = require('./indexController');

const getUsersPage = async (req, res) => {
    try {
        const activeMillId = req.session.user.current_mill_id || req.session.user.mill_id;
<<<<<<< HEAD
        const mmwoRoles = ['ADMIN', 'DIRECTOR', 'SENIOR MILL MANAGER', 'MANAGER', 'ENGINEERING', 'SPV', 'MTC', 'PROC', 'OPERATOR', 'OAA'];
        
        let roleConditions = mmwoRoles.map(r => ({ role: { equals: r, mode: 'insensitive' } }));
        
        let userWhere = { OR: roleConditions };
=======
        let userWhere = {};
>>>>>>> 7659d2ec1bb9b7223dd822056bc72a4854f4b82f
        if (activeMillId) {
            userWhere = {
                AND: [
                    { OR: roleConditions },
                    {
                        OR: [
                            { mill_id: activeMillId },
                            { mill_id: null } // Corporate users
                        ]
                    }
                ]
            };
        }

        let users = await prisma.user.findMany({
            where: userWhere,
            include: { mill: true },
            orderBy: { created_at: 'desc' }
        });
        
        // Normalisasi role ke UPPERCASE agar konsisten di UI MMWO
        users = users.map(u => {
            u.role = (u.role || '').toUpperCase();
            return u;
        });
        const mills = activeMillId ? await prisma.mill.findMany({ where: { id: activeMillId } }) : await prisma.mill.findMany();

        res.render('layout', {
            title: 'User Management',
            body: await renderView('admin/users', { users, mills, hasPermission: res.locals.hasPermission }),
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
        const activeMillId = req.session.user.current_mill_id || req.session.user.mill_id;

        // Fetch Mills with their Stations to allow hierarchical view
        const mills = await prisma.mill.findMany({
            where: activeMillId ? { id: activeMillId } : {},
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
            where: activeMillId ? { mill_id: activeMillId } : {},
            include: { mill: true, station: true, equipment: true },
            orderBy: { created_at: 'desc' }
        });

        const officePlans = await prisma.officePlan.findMany({
            where: activeMillId ? { mill_id: activeMillId } : {},
            include: { mill: true, station: true },
            orderBy: { created_at: 'desc' }
        });

        res.render('layout', {
            title: 'Master Data',
            body: await renderView('admin/master', { mills, processingPlans, officePlans, user: req.session.user, hasPermission: res.locals.hasPermission }),
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

        if (activeMillId) {
            empWhere.OR = [
                { mill_id: activeMillId },
                { mill_id: null }
            ];
            stationWhere.mill_id = activeMillId;
        }

        const employees = await prisma.workshopEmployee.findMany({
            where: empWhere,
            include: { mill: true },
            orderBy: [{ mill_id: 'asc' }, { name: 'asc' }]
        });
        const mills = activeMillId ? await prisma.mill.findMany({ where: { id: activeMillId }, orderBy: { name: 'asc' } }) : await prisma.mill.findMany({ orderBy: { name: 'asc' } });
        const stations = await prisma.station.findMany({
            where: stationWhere,
            orderBy: { name: 'asc' }
        });

        res.render('layout', {
            title: 'Master Labour Employees',
            body: await renderView('admin/employees', { employees, mills, stations, user: req.session.user, hasPermission: res.locals.hasPermission }),
            user: req.session.user,
            path: '/admin/employees'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading employees page');
    }
};

const getAuthMatrixPage = async (req, res) => {
    try {
        const permissions = await prisma.rolePermission.findMany();
        
        res.render('layout', {
            title: 'Matriks Otorisasi Hak Akses',
            body: await renderView('admin/auth_matrix', { permissions, user: req.session.user }),
            user: req.session.user,
            path: '/admin/auth-matrix'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading auth matrix page');
    }
};

const saveAuthMatrix = async (req, res) => {
    try {
        const { permissions } = req.body;
        
        // Execute inside a transaction to ensure all or nothing
        await prisma.$transaction(
            permissions.map(p => 
                prisma.rolePermission.upsert({
                    where: {
                        role_module: {
                            role: p.role,
                            module: p.module
                        }
                    },
                    update: {
                        can_view: p.can_view,
                        can_input: p.can_input,
                        can_edit: p.can_edit,
                        can_delete: p.can_delete
                    },
                    create: {
                        role: p.role,
                        module: p.module,
                        can_view: p.can_view,
                        can_input: p.can_input,
                        can_edit: p.can_edit,
                        can_delete: p.can_delete
                    }
                })
            )
        );

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getUsersPage,
    getMasterDataPage,
    getEmployeesPage,
    getAuthMatrixPage,
    saveAuthMatrix
};
