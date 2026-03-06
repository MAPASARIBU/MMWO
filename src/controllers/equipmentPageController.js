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
                }
            }
        });

        if (!equipment) {
            return res.status(404).send('Equipment not found');
        }

        res.render('layout', {
            title: `Equipment: ${equipment.name}`,
            body: await renderView('equipment/detail', { equipment }),
            user: req.session.user,
            path: '/equipment'
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading equipment details');
    }
};

module.exports = {
    getEquipmentDetail
};
