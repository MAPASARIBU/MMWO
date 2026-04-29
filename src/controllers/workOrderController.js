const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const generateWONumber = async () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get the highest ID in the database instead of counting,
    // to prevent duplicate sequences if a Work Order was deleted.
    const lastWo = await prisma.workOrder.findFirst({
        orderBy: { id: 'desc' },
        select: { id: true }
    });
    
    const nextId = lastWo ? lastWo.id + 1 : 1;
    const sequence = String(nextId).padStart(4, '0');
    return `WO-${date}-${sequence}`;
};

const createWorkOrder = async (req, res) => {
    try {
        const { mill_id, station_id, equipment_id, part_id, category, type, priority, description } = req.body;
        const user = req.session.user || req.user; // User from session or API token

        let finalMillId = mill_id ? parseInt(mill_id) : null;

        // Security: Non-Admin forces their own mill_id
        if (user.role !== 'ADMIN') {
            finalMillId = user.mill_id;
        } else {
            // Admin: if no mill_id provided, default to current selected mill?
            // Usually form provides it, but as fallback use session current
            if (!finalMillId && user.current_mill_id) {
                finalMillId = user.current_mill_id;
            }
        }

        if (!finalMillId) {
            return res.status(400).json({ error: 'Mill ID is required' });
        }

        const reporter_id = user.id;

        const wo_no = await generateWONumber();

        const wo = await prisma.workOrder.create({
            data: {
                wo_no,
                mill_id: finalMillId,
                station_id: parseInt(station_id),
                equipment_id: equipment_id ? parseInt(equipment_id) : null,
                parts: part_id ? { connect: [{ id: parseInt(part_id) }] } : undefined,
                category,
                type,
                priority,
                description,
                status: 'OPEN',
                reporter_id,
            }
        });

        // Add audit log
        await prisma.auditLog.create({
            data: {
                wo_id: wo.id,
                user_id: reporter_id,
                action: 'CREATED',
                new_value: 'OPEN'
            }
        });

        // Handle Photo Upload
        if (req.file) {
            await prisma.attachment.create({
                data: {
                    wo_id: wo.id,
                    kind: 'damage_report',
                    file_path: req.file.filename,
                    file_name: req.file.originalname,
                    mime_type: req.file.mimetype,
                    size: req.file.size,
                    uploaded_by: reporter_id
                }
            });
        }

        res.status(201).json(wo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const getWorkOrders = async (req, res) => {
    try {
        const { status, priority, station_id, assignee_id } = req.query;
        const user = req.session.user || req.user;

        const where = {};
        if (status) where.status = status;
        if (priority) where.priority = priority;
        if (station_id) where.station_id = parseInt(station_id);
        if (assignee_id) where.assignee_id = parseInt(assignee_id);

        // MILL ISOLATION
        if (user.role !== 'ADMIN') {
            where.mill_id = user.mill_id;
        } else if (user.current_mill_id) {
            // Admin sees what they selected in context
            where.mill_id = user.current_mill_id;
        }

        const wos = await prisma.workOrder.findMany({
            where,
            include: {
                mill: true,
                station: true,
                equipment: true,
                parts: true,
                assignee: { select: { name: true } },
                reporter: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' }
        });

        res.json(wos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getWorkOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.session.user || req.user;

        const wo = await prisma.workOrder.findUnique({
            where: { id: parseInt(id) },
            include: {
                mill: true,
                station: true,
                equipment: true,
                parts: true,
                assignee: { select: { name: true } },
                reporter: { select: { name: true } },
                attachments: true,
                comments: { include: { user: { select: { name: true } } } },
                audit_logs: { include: { user: { select: { name: true } } }, orderBy: { created_at: 'desc' } }
            }
        });

        if (!wo) return res.status(404).json({ error: 'Work Order not found' });

        // Access Check
        if (user.role !== 'ADMIN' && wo.mill_id !== user.mill_id) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        res.json(wo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, assignee_id, comment } = req.body;
        const userId = req.session.user.id;
        const user = req.session.user;

        const wo = await prisma.workOrder.findUnique({ where: { id: parseInt(id) }, include: { parts: true } });
        if (!wo) return res.status(404).json({ error: 'Work Order not found' });

        // Access Check
        if (user.role !== 'ADMIN' && wo.mill_id !== user.mill_id) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        if (user.role === 'PROC') {
            return res.status(403).json({ error: 'Access Denied: Procurement role is only allowed to submit Work Orders, not process them.' });
        }

        const updateData = { status };
        let action = 'STATUS_CHANGE';

        // Disconnect unticked parts if replaced_part_ids is provided
        if (req.body.replaced_part_ids !== undefined && Array.isArray(req.body.replaced_part_ids)) {
            updateData.parts = {
                set: req.body.replaced_part_ids.map(id => ({ id: parseInt(id) }))
            };
        }

        // Logic for transitions
        if (status === 'ASSIGNED') {
            // AUTHORIZATION: ADMIN, SPV, MANAGER, MTC can assign
            if (user.role !== 'ADMIN' && user.role !== 'SPV' && user.role !== 'MANAGER' && user.role !== 'SENIOR_MANAGER' && user.role !== 'MTC') {
                return res.status(403).json({ error: 'Access Denied: You cannot assign Work Orders.' });
            }

            if (!assignee_id) return res.status(400).json({ error: 'Assignee required' });
            updateData.assignee_id = parseInt(assignee_id);
            action = 'ASSIGNED';
        }
        else if (status === 'IN_PROGRESS') {
            // AUTHORIZATION: Only MTC or ADMIN can start work
            if (user.role !== 'MTC' && user.role !== 'ADMIN') {
                return res.status(403).json({ error: 'Only Maintenance Team can start work.' });
            }
            updateData.started_at = new Date();
        }
        else if (status === 'COMPLETED') {
            updateData.completed_at = new Date();
        }
        else if (status === 'VERIFIED') {
            updateData.verified_at = new Date();
            action = 'VERIFIED';
        }
        else if (status === 'CLOSED') {
            updateData.closed_at = new Date();
            action = 'CLOSED';

            // Phase 2: Handle automatic part replacement
            if (wo.parts && wo.parts.length > 0) {
                for (const oldPart of wo.parts) {
                    if (oldPart && oldPart.is_active) {
                        // 1. Deactivate old part
                        await prisma.part.update({
                            where: { id: oldPart.id },
                            data: {
                                is_active: false,
                                replaced_at: new Date()
                            }
                        });
                        // 2. Create new part with 0 HM
                        await prisma.part.create({
                            data: {
                                equipment_id: oldPart.equipment_id,
                                name: oldPart.name,
                                lifetime_hm: oldPart.lifetime_hm,
                                current_hm: 0,
                                is_active: true
                            }
                        });
                    }
                }
            }
        }

        const updatedWo = await prisma.workOrder.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        // Audit Log
        const logData = {
            wo_id: updatedWo.id,
            user_id: userId,
            action: action,
            old_value: wo.status,
            new_value: status
        };
        await prisma.auditLog.create({ data: logData });

        // Add comment/note if provided (e.g. failure reason or verify note)
        if (comment) {
            await prisma.comment.create({
                data: {
                    wo_id: updatedWo.id,
                    user_id: userId,
                    comment
                }
            });
        }

        res.json(updatedWo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const addAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const { kind } = req.body; // damage, completion
        const user = req.session.user;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Brief Access Check (optimization: fetch minimal)
        const wo = await prisma.workOrder.findUnique({ where: { id: parseInt(id) }, select: { mill_id: true } });
        if (!wo) return res.status(404).json({ error: 'Work Order not found' });

        if (user.role !== 'ADMIN' && wo.mill_id !== user.mill_id) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        const attachment = await prisma.attachment.create({
            data: {
                wo_id: parseInt(id),
                kind: kind || 'general',
                file_path: req.file.filename,
                file_name: req.file.originalname,
                mime_type: req.file.mimetype,
                size: req.file.size,
                uploaded_by: req.session.user.id
            }
        });

        await prisma.auditLog.create({
            data: {
                wo_id: parseInt(id),
                user_id: req.session.user.id,
                action: 'UPLOAD',
                field: kind,
                new_value: req.file.originalname
            }
        });

        res.status(201).json(attachment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const user = req.session.user;

        // Brief Access Check
        const wo = await prisma.workOrder.findUnique({ where: { id: parseInt(id) }, select: { mill_id: true } });
        if (!wo) return res.status(404).json({ error: 'Work Order not found' });

        if (user.role !== 'ADMIN' && wo.mill_id !== user.mill_id) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        const newComment = await prisma.comment.create({
            data: {
                wo_id: parseInt(id),
                user_id: req.session.user.id,
                comment
            },
            include: { user: { select: { name: true } } }
        });

        res.status(201).json(newComment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const bulkCreateFromParts = async (req, res) => {
    try {
        const { part_ids } = req.body;
        const user = req.session.user || req.user;

        if (!part_ids || !Array.isArray(part_ids) || part_ids.length === 0) {
            return res.status(400).json({ error: 'No parts selected' });
        }

        const parts = await prisma.part.findMany({
            where: { id: { in: part_ids.map(id => parseInt(id)) } },
            include: { equipment: { include: { station: true } } }
        });

        // Group by equipment_id
        const groupedParts = {};
        for (const part of parts) {
            if (!groupedParts[part.equipment_id]) {
                groupedParts[part.equipment_id] = [];
            }
            groupedParts[part.equipment_id].push(part);
        }

        const createdWos = [];
        for (const eqParts of Object.values(groupedParts)) {
            if (eqParts.length === 0) continue;
            
            const firstPart = eqParts[0];
            const wo_no = await generateWONumber();

            let description = eqParts.length > 1 
                ? `WO Penggantian Part Massal (${eqParts.length} item):\n` 
                : `WO Penggantian Part:\n`;
            
            eqParts.forEach(p => {
                description += `- ${p.name} (HM: ${p.current_hm}/${p.lifetime_hm})\n`;
            });

            const wo = await prisma.workOrder.create({
                data: {
                    wo_no,
                    mill_id: firstPart.equipment.station.mill_id,
                    station_id: firstPart.equipment.station_id,
                    equipment_id: firstPart.equipment_id,
                    parts: {
                        connect: eqParts.map(p => ({ id: p.id }))
                    },
                    category: 'Mechanical',
                    type: 'Preventive',
                    priority: 'P1',
                    description: description.trim(),
                    status: 'OPEN',
                    reporter_id: user.id,
                }
            });

            await prisma.auditLog.create({
                data: {
                    wo_id: wo.id,
                    user_id: user.id,
                    action: 'CREATED',
                    new_value: 'OPEN'
                }
            });
            createdWos.push(wo);
        }

        res.status(201).json({ success: true, count: createdWos.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const deleteWorkOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.session.user;

        if (user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access Denied: Only ADMIN can delete Work Orders.' });
        }

        const wo = await prisma.workOrder.findUnique({
            where: { id: parseInt(id) }
        });

        if (!wo) {
            return res.status(404).json({ error: 'Work Order not found.' });
        }

        if (wo.status === 'COMPLETED' || wo.status === 'CLOSED') {
            return res.status(400).json({ error: 'Tidak bisa menghapus Work Order yang sudah COMPLETED atau CLOSED.' });
        }

        await prisma.$transaction([
            prisma.auditLog.deleteMany({ where: { wo_id: parseInt(id) } }),
            prisma.comment.deleteMany({ where: { wo_id: parseInt(id) } }),
            prisma.attachment.deleteMany({ where: { wo_id: parseInt(id) } }),
            prisma.weeklyPlan.deleteMany({ where: { wo_id: parseInt(id) } }),
            prisma.workOrder.delete({ where: { id: parseInt(id) } })
        ]);

        res.json({ success: true, message: 'Work Order deleted successfully.' });

    } catch (error) {
        console.error("Delete Work Order Error:", error);
        res.status(500).json({ error: 'Terjadi kesalahan sistem saat menghapus Work Order.' });
    }
};

const assignPics = async (req, res) => {
    try {
        const { id } = req.params;
        const { pic_ids } = req.body;
        
        if (!Array.isArray(pic_ids)) {
            return res.status(400).json({ error: 'Invalid data format' });
        }
        
        if (pic_ids.length > 4) {
             return res.status(400).json({ error: 'Maksimal 4 mekanik/PIC yang dapat dipilih.' });
        }

        const wo = await prisma.workOrder.update({
            where: { id: parseInt(id) },
            data: {
                pics: {
                    set: pic_ids.map(pid => ({ id: parseInt(pid) }))
                }
            }
        });
        
        res.json({ success: true, wo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Terjadi kesalahan sistem saat menyimpan PIC.' });
    }
};

module.exports = {
    createWorkOrder,
    getWorkOrders,
    getWorkOrderById,
    updateStatus,
    addAttachment,
    addComment,
    bulkCreateFromParts,
    deleteWorkOrder,
    assignPics
};
