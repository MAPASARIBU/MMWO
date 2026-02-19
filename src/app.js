const express = require('express');
const session = require('express-session');
const morgan = require('morgan');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { ensureAuthenticated, ensureRole } = require('./middleware/authMiddleware');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const masterRoutes = require('./routes/master');
const woRoutes = require('./routes/workOrders');
const weeklyPlanRoutes = require('./routes/weeklyPlan');
const userRoutes = require('./routes/users');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

// Middleware
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'mmwo_dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// Make user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

const indexController = require('./controllers/indexController');

// Routes
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});

app.get('/dashboard', ensureAuthenticated, indexController.getDashboard);
app.get('/dashboard/print', ensureAuthenticated, indexController.getPrintRecap);

const woPageController = require('./controllers/woPageController');
app.get('/work-orders', ensureAuthenticated, woPageController.listWorkOrders);
app.get('/work-orders/create', ensureAuthenticated, woPageController.createWorkOrderPage);
app.get('/work-orders/:id', ensureAuthenticated, woPageController.detailWorkOrderPage);

const weeklyPlanPageController = require('./controllers/weeklyPlanPageController');
app.get('/weekly-plan', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPage);

const adminController = require('./controllers/adminController');
app.get('/admin/users', ensureRole(['ADMIN']), adminController.getUsersPage);
app.get('/admin/master', ensureRole(['ADMIN']), adminController.getMasterDataPage);

app.use('/auth', authRoutes);
app.use('/api', masterRoutes);
app.use('/api/work-orders', woRoutes);
app.use('/api/weekly-plan', weeklyPlanRoutes);
app.use('/api/users', userRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).send('Not Found');
});

// Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
