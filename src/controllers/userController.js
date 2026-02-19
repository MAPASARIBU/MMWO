const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const getUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                name: true,
                role: true,
                is_active: true,
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
        const { username, password, name, role, mill_id } = req.body;
        const password_hash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                username,
                password_hash,
                name,
                role,
                mill_id: mill_id ? parseInt(mill_id) : null
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

module.exports = {
    getUsers,
    createUser,
    toggleActive
};
