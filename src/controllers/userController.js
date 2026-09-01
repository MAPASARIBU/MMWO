const bcrypt = require('bcryptjs');
const prisma = require('../prisma');

const getUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                name: true,
                role: true,
                is_active: true,
                phone: true,
                mill: true,
                created_at: true
            }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createUser = async (req, res) => {
    try {
        const { username, password, name, role, phone, mill_id, accessible_mills } = req.body;
        const password_hash = await bcrypt.hash(password, 10);

        let accessibleMillsStr = null;
        if (role === 'SENIOR_MANAGER' && Array.isArray(accessible_mills)) {
            accessibleMillsStr = JSON.stringify(accessible_mills);
        }

        const user = await prisma.user.create({
            data: {
                username,
                password_hash,
                name,
                role,
                phone: phone || null,
                mill_id: mill_id ? parseInt(mill_id) : null,
                accessible_mills: accessibleMillsStr
            }
        });

        const { password_hash: _, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const toggleActive = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        const user = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { is_active }
        });

        res.json({ id: user.id, is_active: user.is_active });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, phone, mill_id, accessible_mills } = req.body;

        let accessibleMillsStr = null;
        if (role === 'SENIOR_MANAGER' && Array.isArray(accessible_mills)) {
            accessibleMillsStr = JSON.stringify(accessible_mills);
        }

        const dataToUpdate = {
            name,
            role,
            phone: phone || null,
            mill_id: mill_id ? parseInt(mill_id) : null,
            accessible_mills: accessibleMillsStr
        };

        // If password is provided in the future, we can add it here.
        if (req.body.password) {
            dataToUpdate.password_hash = await bcrypt.hash(req.body.password, 10);
        }

        const user = await prisma.user.update({
            where: { id: parseInt(id) },
            data: dataToUpdate
        });

        const { password_hash: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return res.status(400).json({ error: 'ID User tidak valid' });
        }

        // Check if user has related records
        const [relatedWO, relatedAudit, relatedComments, relatedPlans] = await Promise.all([
            prisma.workOrder.count({
                where: {
                    OR: [
                        { reporter_id: userId },
                        { assignee_id: userId }
                    ]
                }
            }),
            prisma.auditLog.count({ where: { user_id: userId } }),
            prisma.comment.count({ where: { user_id: userId } }),
            prisma.weeklyPlan.count({ where: { planned_by: userId } })
        ]);

        if (relatedWO > 0 || relatedAudit > 0 || relatedComments > 0 || relatedPlans > 0) {
            const details = [];
            if (relatedWO > 0) details.push(`${relatedWO} Work Order`);
            if (relatedPlans > 0) details.push(`${relatedPlans} Weekly Plan`);
            if (relatedComments > 0) details.push(`${relatedComments} Komentar`);
            if (relatedAudit > 0) details.push(`${relatedAudit} Audit Log`);

            return res.status(400).json({
                error: `User tidak dapat dihapus permanen karena memiliki riwayat data aktif di sistem (${details.join(', ')}). Silakan gunakan tombol "Deactivate" agar user tidak bisa login tanpa merusak data historis.`
            });
        }

        await prisma.user.delete({
            where: { id: userId }
        });
        res.json({ success: true });
    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({
                error: 'User terikat dengan data lain di sistem. Silakan nonaktifkan (Deactivate) user tersebut.'
            });
        }
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getUsers,
    createUser,
    toggleActive,
    updateUser,
    deleteUser
};
