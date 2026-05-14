const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { renderView } = require('./indexController');

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
        let accessible_mills = [];
        if (user.role === 'SENIOR_MANAGER') {
            try {
                accessible_mills = user.accessible_mills ? JSON.parse(user.accessible_mills) : [];
            } catch (e) {
                console.error("Error parsing accessible_mills:", e);
                accessible_mills = [];
            }
            if (!accessible_mills.includes(selectedMillId)) {
                return res.render('login', { error: `Access Denied: You do not have access to ${selectedMill.name}.`, mills });
            }
        } else if (user.role !== 'ADMIN' && user.mill_id !== selectedMillId) {
            // If NOT Admin or Senior Manager, user MUST select their assigned mill
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
            accessible_mills: accessible_mills,
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

const changePasswordPage = async (req, res) => {
    try {
        res.render('layout', {
            title: 'Change Password',
            user: req.session.user,
            path: '/auth/change-password',
            body: await renderView('auth/change-password', { error: null, success: null })
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
};

const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.user.id;

        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.render('layout', {
                title: 'Change Password',
                user: req.session.user,
                path: '/auth/change-password',
                body: await renderView('auth/change-password', { error: 'Semua kolom harus diisi.', success: null })
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render('layout', {
                title: 'Change Password',
                user: req.session.user,
                path: '/auth/change-password',
                body: await renderView('auth/change-password', { error: 'Password baru dan konfirmasi tidak sama.', success: null })
            });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        const isValid = await bcrypt.compare(oldPassword, user.password_hash);

        if (!isValid) {
            return res.render('layout', {
                title: 'Change Password',
                user: req.session.user,
                path: '/auth/change-password',
                body: await renderView('auth/change-password', { error: 'Password lama salah.', success: null })
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: userId },
            data: { password_hash: hashedPassword }
        });

        return res.render('layout', {
            title: 'Change Password',
            user: req.session.user,
            path: '/auth/change-password',
            body: await renderView('auth/change-password', { error: null, success: 'Password berhasil diubah!' })
        });

    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
};

module.exports = {
    loginPage,
    login,
    logout,
    changePasswordPage,
    changePassword
};
