const ensureAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

const ensureRole = (roles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.redirect('/auth/login');
        }

        if (roles.includes(req.session.user.role)) {
            return next();
        }

        res.status(403).send('Forbidden: Insufficient privileges');
    };
};

module.exports = {
    ensureAuthenticated,
    ensureRole
};
