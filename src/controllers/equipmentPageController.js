const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const getEquipmentDetail = async (req, res) => {
    try {
        const equipmentId = parseInt(req.params.id);
        const equipment = await prisma.equipment.findUnique({
            where: { id: equipmentId },
            include: {
                station: {
                    include: { mill: true }
                },
                parts: {
                    orderBy: { installed_at: 'desc' }
                },
                hm_records: {
                    orderBy: { record_date: 'desc' },
                    take: 10
                },
                periodic_pms: {
                    orderBy: { next_due_date: 'asc' }
                }
            }
        });

        if (!equipment) {
            return res.status(404).send('Equipment not found');
        }

        res.render('layout', {
            title: `Equipment: ${equipment.name}`,
            body: await renderView('equipment/detail', { equipment, user: req.session.user }),
            user: req.session.user,
            path: '/equipment'
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading equipment details');
    }
};

const getInputHmPage = async (req, res) => {
    try {
        const user = req.session.user;
        let millId = null;
        
        // Handle admin viewing different mills or their own
        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
            if (req.query.millId) {
                millId = parseInt(req.query.millId);
            } else if (user.current_mill_id) {
                millId = user.current_mill_id;
            }
        } else {
            millId = user.mill_id;
        }

        let stationCondition = undefined;
        if (millId) {
            stationCondition = { mill_id: millId };
        } else if (user.role === 'SENIOR_MANAGER') {
            stationCondition = { mill_id: { in: user.accessible_mills || [] } };
        }

        // Fetch equipment that have at least one active part
        const equipments = await prisma.equipment.findMany({
            where: {
                is_active: true,
                station: stationCondition,
                parts: {
                    some: { is_active: true }
                }
            },
            include: {
                station: { include: { mill: true } },
                parts: { where: { is_active: true } }
            },
            orderBy: [
                { station_id: 'asc' },
                { name: 'asc' }
            ]
        });

        // Also fetch mills for admin filter
        let mills = [];
        if (user.role === 'ADMIN') {
            mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } });
        } else if (user.role === 'SENIOR_MANAGER') {
            mills = await prisma.mill.findMany({ 
                where: { id: { in: user.accessible_mills || [] } },
                orderBy: { name: 'asc' } 
            });
        }

        res.render('layout', {
            title: `Input Daily HM`,
            body: await renderView('equipment/input_hm', { equipments, mills, selectedMillId: millId, user }),
            user: req.session.user,
            path: '/input-hm'
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading Input HM page');
    }
};

module.exports = {
    getEquipmentDetail,
    getInputHmPage
};
