const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const loginPage = async (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    try {
        const mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } });
        res.render('login', { error: null, mills });
    } catch (error) {
        console.error("Error fetching mills for login:", error);
        res.render('login', { error: 'System error loading login page', mills: [] });
    }
};

const login = async (req, res) => {
    const { millId, username, password } = req.body;

    try {
        // Validate Mill Selection
        if (!millId) {
            const mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } });
            return res.render('login', { error: 'Please select a Mill', mills });
        }

        const selectedMillId = parseInt(millId);
        const selectedMill = await prisma.mill.findUnique({ where: { id: selectedMillId } });

        if (!selectedMill) {
            const mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } });
            return res.render('login', { error: 'Invalid Mill selected', mills });
        }

        const user = await prisma.user.findUnique({
            where: { username },
        });

        const mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } }); // Re-fetch for error render

        if (!user) {
            return res.render('login', { error: 'Invalid username or password', mills });
        }

        if (!user.is_active) {
            return res.render('login', { error: 'Account is disabled', mills });
        }

        // Validate Mill Access
        // If NOT Admin, user MUST select their assigned mill
        if (user.role !== 'ADMIN' && user.mill_id !== selectedMillId) {
            return res.render('login', { error: `Access Denied: You are attempting to login to ${selectedMill.name} but your account is assigned to another mill.`, mills });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.render('login', { error: 'Invalid username or password', mills });
        }

        // Set session
        req.session.user = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            mill_id: user.mill_id,
            current_mill_id: selectedMillId, // The mill they logged into
            current_mill_name: selectedMill.name
        };

        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        const mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } }).catch(() => []);
        res.render('login', { error: 'An error occurred during login', mills });
    }
};

const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error(err);
        res.redirect('/auth/login');
    });
};

module.exports = {
    loginPage,
    login,
    logout
};
