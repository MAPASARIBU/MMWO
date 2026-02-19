const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper: Generate WO Number (WO-YYYYMMDD-XXXX)
const generateWONumber = async () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await prisma.workOrder.count();
    const sequence = String(count + 1).padStart(4, '0');
    return `WO-${date}-${sequence}`;
};

const createWorkOrder = async (req, res) => {
    try {
        const { mill_id, station_id, equipment_id, category, type, priority, description } = req.body;
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

        const wo = await prisma.workOrder.findUnique({ where: { id: parseInt(id) } });
        if (!wo) return res.status(404).json({ error: 'Work Order not found' });

        // Access Check
        if (user.role !== 'ADMIN' && wo.mill_id !== user.mill_id) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        const updateData = { status };
        let action = 'STATUS_CHANGE';

        // Logic for transitions
        if (status === 'ASSIGNED') {
            if (!assignee_id) return res.status(400).json({ error: 'Assignee required' });
            updateData.assignee_id = parseInt(assignee_id);
            action = 'ASSIGNED';
        }
        else if (status === 'IN_PROGRESS') {
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

module.exports = {
    createWorkOrder,
    getWorkOrders,
    getWorkOrderById,
    updateStatus,
    addAttachment,
    addComment
};
