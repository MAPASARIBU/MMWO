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

module.exports = {
    upsertPlan,
    bulkPlan,
    getPlans
};
