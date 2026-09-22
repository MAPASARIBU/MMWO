const prisma = require('../prisma');

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
        let { wo_ids, planned_week, planned_day, times_data } = req.body;
        const planner_id = req.session && req.session.user ? req.session.user.id : 1;

        let rawIds = wo_ids || req.body['wo_ids[]'] || req.body.woIds;
        if (!rawIds) {
            return res.status(400).send("No Work Orders selected");
        }
        if (!Array.isArray(rawIds)) {
            rawIds = [rawIds];
        }

        const intWoIds = rawIds.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
        if (intWoIds.length === 0) {
            return res.status(400).send("Invalid Work Order IDs");
        }

        // Calculate ISO week if planned_day is present but planned_week is missing
        if (!planned_week && planned_day) {
            const date = new Date(planned_day);
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const year = d.getUTCFullYear();
            const weekNo = Math.ceil((((d - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
            planned_week = `${year}-W${String(weekNo).padStart(2, '0')}`;
        }

        // Handle times updates
        const updatePromises = [];
        if (times_data && Array.isArray(times_data) && planned_day) {
            for (const td of times_data) {
                if (!td || !td.id) continue;
                const updateData = {};
                let baseDate = new Date(planned_day);
                if (td.start) {
                    const [h, m] = td.start.split(':');
                    let startDate = new Date(baseDate);
                    startDate.setHours(parseInt(h), parseInt(m), 0, 0);
                    updateData.target_start = startDate;
                }
                if (td.finish) {
                    const [h, m] = td.finish.split(':');
                    let finishDate = new Date(baseDate);
                    finishDate.setHours(parseInt(h), parseInt(m), 0, 0);
                    updateData.target_finish = finishDate;
                }
                if (td.rest !== undefined) {
                    updateData.rest_hours_val = parseFloat(td.rest) || 0;
                }
                
                if(updateData.target_start && isNaN(updateData.target_start.getTime())) delete updateData.target_start; 
                if(updateData.target_finish && isNaN(updateData.target_finish.getTime())) delete updateData.target_finish; 
                
                if (Object.keys(updateData).length > 0) {
                    updatePromises.push(`
                        UPDATE work_orders 
                        SET 
                            target_start = ${updateData.target_start ? "'" + updateData.target_start.toISOString() + "'" : 'target_start'},
                            target_finish = ${updateData.target_finish ? "'" + updateData.target_finish.toISOString() + "'" : 'target_finish'},
                            rest_hours_val = ${updateData.rest_hours_val !== undefined ? updateData.rest_hours_val : 'rest_hours_val'}
                        WHERE id = ${td.id}
                    `);
                }
            }
        }

        // Execute bulk upsert as an atomic delete + create transaction
        await prisma.$transaction([
            prisma.weeklyPlan.deleteMany({
                where: { wo_id: { in: intWoIds } }
            }),
            prisma.weeklyPlan.createMany({
                data: intWoIds.map(wo_id => ({
                    wo_id,
                    planned_week: planned_week || '',
                    planned_day: planned_day || '',
                    planned_by: planner_id
                }))
            })
        ]);
        
        // Execute the raw updates outside transaction sequentially to avoid schema cache issues and deadlocks
        if (updatePromises.length > 0) {
            for (const sql of updatePromises) {
                await prisma.$executeRawUnsafe(sql);
            }
        }

        if (req.xhr || req.headers.accept?.includes('application/json') || req.is('json') || req.headers['content-type']?.includes('application/json')) {
            return res.json({
                success: true,
                count: intWoIds.length,
                planned_day: planned_day || '',
                planned_week: planned_week || '',
                wo_ids: intWoIds
            });
        }

        const referer = req.get('Referer') || '';
        if (referer) {
            res.redirect(referer);
        } else {
            let redirectUrl = `/weekly-plan?tab=plan`;
            if (planned_week) redirectUrl += `&week=${planned_week}`;
            res.redirect(redirectUrl);
        }
    } catch (error) {
        console.error("bulkPlan Error:", error);
        res.status(500).json({ error: "Error saving weekly plan: " + error.message });
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
        const mill_id = req.session.user.current_mill_id || req.session.user.mill_id || 1; // Respect current mill context
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
