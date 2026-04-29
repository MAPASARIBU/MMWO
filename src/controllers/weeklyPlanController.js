const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const upsertPlan = async (req, res) => {
    try {
        const { wo_id, planned_week, planned_day } = req.body;
        const planner_id = req.session.user.id;

        const plan = await prisma.weeklyPlan.upsert({
            where: { wo_id: parseInt(wo_id) },
            update: {
                planned_week,
                planned_day,
                planned_by: planner_id
            },
            create: {
                wo_id: parseInt(wo_id),
                planned_week,
                planned_day,
                planned_by: planner_id
            }
        });

        res.json(plan);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const bulkPlan = async (req, res) => {
    try {
        const { wo_ids, planned_week, planned_day } = req.body;
        const planner_id = req.session.user.id;

        // wo_ids is expected to be an array of strings/numbers
        if (!wo_ids || !Array.isArray(wo_ids) || wo_ids.length === 0) {
            return res.status(400).send("No Work Orders selected");
        }

        const updates = wo_ids.map(id => {
            return prisma.weeklyPlan.upsert({
                where: { wo_id: parseInt(id) },
                update: {
                    planned_week,
                    planned_day,
                    planned_by: planner_id
                },
                create: {
                    wo_id: parseInt(id),
                    planned_week,
                    planned_day,
                    planned_by: planner_id
                }
            });
        });

        await Promise.all(updates);

        let redirectUrl = `/weekly-plan?week=${planned_week}`;
        if (planned_day) {
            redirectUrl += `&day=${planned_day}`;
        }

        res.redirect(redirectUrl);
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const getPlans = async (req, res) => {
    try {
        const { week } = req.query;
        const where = week ? { planned_week: week } : {};

        const plans = await prisma.weeklyPlan.findMany({
            where,
            include: {
                wo: {
                    include: {
                        mill: true,
                        station: true,
                        equipment: true
                    }
                }
            }
        });

        res.json(plans);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const addNonWoJob = async (req, res) => {
    try {
        const { category, station_id, equipment_id, description, planned_week, planned_day, pic_ids } = req.body;
        const planner_id = req.session.user.id;
        const mill_id = req.session.user.mill_id || 1; // Assuming default if admin

        // Generate a pseudo-WO number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const wo_no = `FAB-${dateStr}-${randomNum}`;

        // Create the WorkOrder
        const wo = await prisma.workOrder.create({
            data: {
                wo_no,
                mill_id,
                station_id: parseInt(station_id),
                equipment_id: equipment_id ? parseInt(equipment_id) : null,
                category: category || 'Fabrication',
                type: 'NON-WO',
                priority: 'NORMAL',
                description,
                status: 'PLANNED',
                reporter_id: planner_id,
            }
        });

        // Link PICs if provided
        if (pic_ids && Array.isArray(pic_ids)) {
            const picsToConnect = pic_ids.map(id => ({ id: parseInt(id) }));
            await prisma.workOrder.update({
                where: { id: wo.id },
                data: {
                    pics: {
                        connect: picsToConnect
                    }
                }
            });
        }

        // Add to WeeklyPlan
        await prisma.weeklyPlan.create({
            data: {
                wo_id: wo.id,
                planned_week,
                planned_day,
                planned_by: planner_id
            }
        });

        res.json({ success: true, wo });
    } catch (error) {
        console.error('Error adding Non-WO job:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    upsertPlan,
    bulkPlan,
    getPlans,
    addNonWoJob
};
