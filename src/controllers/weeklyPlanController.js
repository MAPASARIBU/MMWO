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

        // Use sequential upserts to prevent overwhelming serverless DB connections
        
        let millIdToDelete = req.session.user.mill_id;
        const firstWo = await prisma.workOrder.findUnique({ where: { id: parseInt(wo_ids[0]) } });
        if (firstWo) {
            millIdToDelete = firstWo.mill_id;
        }

        const referer = req.get('Referer') || '';
        let categoryWhere;
        if (referer.includes('/processing')) {
            categoryWhere = { category: 'Processing' };
        } else if (referer.includes('/civil')) {
            categoryWhere = { category: 'Civil' };
        } else if (referer.includes('/office')) {
            categoryWhere = { category: 'Office' };
        } else {
            categoryWhere = { category: { notIn: ['Processing', 'Civil', 'Office'] } };
        }

        if (planned_day && millIdToDelete) {
            // Find existing plans safely
            const plansToDelete = await prisma.weeklyPlan.findMany({
                where: {
                    planned_day,
                    wo: {
                        ...categoryWhere,
                        mill_id: millIdToDelete
                    }
                },
                select: { id: true }
            });

            const planIdsToDelete = plansToDelete.map(p => p.id);
            if (planIdsToDelete.length > 0) {
                await prisma.weeklyPlan.deleteMany({
                    where: { id: { in: planIdsToDelete } }
                });
            }
        }

        for (const id of wo_ids) {
            await prisma.weeklyPlan.upsert({
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
        }

        // Redirect back to the page the user came from (Civil, Processing, or Maintenance)
        if (referer) {
            res.redirect(referer);
        } else {
            let redirectUrl = `/weekly-plan?week=${planned_week}`;
            if (planned_day) {
                redirectUrl += `&day=${planned_day}`;
            }
            res.redirect(redirectUrl);
        }
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
        const { jobs, category, station_id, equipment_id, description, planned_week, planned_day, pic_ids } = req.body;
        const planner_id = req.session.user.id;
        const mill_id = req.session.user.mill_id || 1; // Assuming default if admin
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        if (jobs && Array.isArray(jobs)) {
            const createdWos = [];
            for (let i = 0; i < jobs.length; i++) {
                const job = jobs[i];
                if (!job.description || job.description.trim() === '') continue;
                
                const randomNum = Math.floor(Math.random() * 100).toString().padStart(2, '0');
                const seq = String(i + 1).padStart(3, '0');
                const prefix = job.category === 'Processing' ? 'PRC' : 'FAB';
                const wo_no = `${prefix}-${dateStr}-${randomNum}${seq}`;

                const wo = await prisma.workOrder.create({
                    data: {
                        wo_no,
                        mill_id,
                        station_id: parseInt(job.station_id),
                        category: job.category || 'Processing',
                        type: 'NON-WO',
                        priority: 'NORMAL',
                        description: job.description,
                        status: 'PLANNED',
                        reporter_id: planner_id,
                    }
                });
                createdWos.push(wo);
            }
            return res.json({ success: true, count: createdWos.length });
        }

        // Single insert
        const prefix = category === 'Processing' ? 'PRC' : 'FAB';
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const wo_no = `${prefix}-${dateStr}-${randomNum}`;

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

        // Add to WeeklyPlan if planned_week is provided
        if (planned_week) {
            await prisma.weeklyPlan.create({
                data: {
                    wo_id: wo.id,
                    planned_week,
                    planned_day,
                    planned_by: planner_id
                }
            });
        }

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
