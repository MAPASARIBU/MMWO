const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ensureAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.redirect('/auth/login');
};

const ensureRole = (roles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            return res.redirect('/auth/login');
        }

        if (roles.includes(req.session.user.role)) {
            return next();
        }

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        res.status(403).send('Forbidden: Insufficient privileges');
    };
};

const ensurePermission = (moduleName, action) => {
    return async (req, res, next) => {
        if (!req.session.user) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            return res.redirect('/auth/login');
        }

        if (req.session.user.role === 'ADMIN') {
            return next();
        }

        try {
            const perm = await prisma.rolePermission.findUnique({
                where: {
                    role_module: {
                        role: req.session.user.role,
                        module: moduleName
                    }
                }
            });

            if (!perm) {
                if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                    return res.status(403).json({ error: 'Access Denied' });
                }
                return res.status(403).send('Access Denied');
            }

            let hasAccess = false;
            if (action === 'view') hasAccess = perm.can_view;
            else if (action === 'input') hasAccess = perm.can_input;
            else if (action === 'edit') hasAccess = perm.can_edit;
            else if (action === 'delete') hasAccess = perm.can_delete;

            if (!hasAccess) {
                if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                    return res.status(403).json({ error: 'Access Denied' });
                }
                return res.status(403).send('Access Denied');
            }

            next();
        } catch (error) {
            console.error(error);
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(500).json({ error: 'Server error' });
            }
            res.status(500).send('Server error');
        }
    };
};

module.exports = {
    ensureAuthenticated,
    ensureRole,
    ensurePermission
};
