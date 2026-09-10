require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
// Trigger Render restart to clear Prisma query engine schema cache
const session = require('express-session');
const morgan = require('morgan');
const path = require('path');
const prisma = require('./prisma');
const { ensureAuthenticated, ensureRole } = require('./middleware/authMiddleware');

const authRoutes = require('./routes/auth');
const masterRoutes = require('./routes/master');
const woRoutes = require('./routes/workOrders');
const weeklyPlanRoutes = require('./routes/weeklyPlan');
const userRoutes = require('./routes/users');
const equipmentPartsRoutes = require('./routes/equipmentParts');
const monitoringRoutes = require('./routes/monitoring');
const processingPlanRoutes = require('./routes/processingPlanRoutes');
const officePlanRoutes = require('./routes/officePlanRoutes');
const analyticsRoutes = require('./routes/analytics');
const { startPMCron } = require('./cron/pmCron');
const { startProcessingCron } = require('./cron/processingCron');
const { startOfficeCron } = require('./cron/officeCron');
const { startHMCron } = require('./cron/hmCron');
const whatsappService = require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

// Cache bust version for static assets (refreshed on every server restart)
app.locals.appVersion = Date.now();

try {
    const compression = require('compression');
    app.use(compression());
} catch (e) {
    // compression optional
}
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'mmwo_dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Allows session cookies to work on both HTTP and HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// Auth Middleware & Session injection
app.use(async (req, res, next) => {
    res.locals.user = req.session.user;
    res.locals.rolePerms = [];
    if (req.session.user && req.session.user.role) {
        try {
            const prisma = require('./prisma');
            res.locals.rolePerms = await prisma.rolePermission.findMany({
                where: { role: req.session.user.role }
            });
        } catch (e) {
            console.error("Error loading permissions:", e);
        }
    }
    
    // Global EJS Helper for dynamic UI permissions
    res.locals.hasPermission = (moduleName, action = 'can_view') => {
        if (!res.locals.user) return false;
        if (res.locals.user.role === 'ADMIN') return true;
        const p = res.locals.rolePerms.find(x => x.module === moduleName);
        return p && p[action] === true;
    };
    
    next();
});

// Middleware for checking dynamic permissions
const ensurePermission = (moduleName, action = 'can_view') => {
    return (req, res, next) => {
        if (!req.session.user) return res.redirect('/auth/login');
        if (req.session.user.role === 'ADMIN') return next(); // Admin always allowed bypass
        
        const perms = res.locals.rolePerms;
        if (!perms || perms.length === 0) return res.status(403).send('Forbidden: No permissions loaded');
        
        const modPerm = perms.find(p => p.module === moduleName);
        if (modPerm && modPerm[action] === true) {
            return next();
        }
        res.status(403).send('Forbidden: Insufficient privileges for this module');
    };
};
// Attach to app for routes to use if needed
app.locals.ensurePermission = ensurePermission;

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
const equipmentPageController = require('./controllers/equipmentPageController');
app.get('/work-orders', ensureAuthenticated, woPageController.listWorkOrders);
app.get('/work-orders/create', ensureAuthenticated, woPageController.createWorkOrderPage);
app.get('/work-orders/:id', ensureAuthenticated, woPageController.detailWorkOrderPage);
app.get('/equipment/:id', ensureAuthenticated, equipmentPageController.getEquipmentDetail);
app.get('/input-hm', ensureRole(['ADMIN', 'PROC', 'OPERATOR']), equipmentPageController.getInputHmPage);
app.get('/work-orders/:id', ensureAuthenticated, woPageController.detailWorkOrderPage);

const weeklyPlanPageController = require('./controllers/weeklyPlanPageController');
app.get('/weekly-plan', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPage);
app.get('/weekly-plan/print', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPrint);
app.get('/weekly-plan/processing', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPage);
app.get('/weekly-plan/processing/print', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPrint);
app.get('/weekly-plan/civil', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPage);
app.get('/weekly-plan/civil/print', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPrint);
app.get('/weekly-plan/office', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPage);
app.get('/weekly-plan/office/print', ensureAuthenticated, weeklyPlanPageController.getWeeklyPlanPrint);

const monthlyPlanController = require('./controllers/monthlyPlanController');
app.get('/monthly-plan', ensureAuthenticated, (req, res) => res.redirect('/weekly-plan?tab=monthly-plan'));
app.post('/api/work-orders/:id/monthly-plan-status', ensureAuthenticated, monthlyPlanController.setMonthlyPlanStatus);
app.post('/api/monthly-plan/:id/materials', ensureAuthenticated, monthlyPlanController.addMaterial);
app.delete('/api/monthly-plan/materials/:material_id', ensureAuthenticated, monthlyPlanController.deleteMaterial);
app.patch('/api/monthly-plan/:id/materials/:material_id/toggle', ensureAuthenticated, monthlyPlanController.toggleMaterialComplete);

const adminController = require('./controllers/adminController');
app.get('/admin/users', ensureRole(['ADMIN']), adminController.getUsersPage);
app.get('/admin/master', ensureRole(['ADMIN', 'SPV', 'OAA', 'MANAGER', 'SENIOR_MANAGER', 'MTC', 'PROC']), adminController.getMasterDataPage);

const employeeRoutes = require('./routes/employees');
app.use('/auth', authRoutes);
app.use('/api', masterRoutes);
app.use('/api/equipment', equipmentPartsRoutes); // Equipment parts & HM
app.use('/api/work-orders', woRoutes);
app.use('/api/weekly-plan', weeklyPlanRoutes);
app.use('/api/users', userRoutes);
app.use('/monitoring', monitoringRoutes);
app.use('/employees', employeeRoutes);
app.use('/processing-plans', processingPlanRoutes);
app.use('/office-plans', officePlanRoutes);

app.use('/analytics', analyticsRoutes);

// Admin Pages
app.get('/admin/employees', ensureRole(['ADMIN']), adminController.getEmployeesPage);
app.get('/admin/auth-matrix', ensureRole(['ADMIN']), adminController.getAuthMatrixPage);
app.post('/admin/api/auth-matrix', ensureRole(['ADMIN']), adminController.saveAuthMatrix);

const whatsappController = require('./controllers/whatsappController');
app.get('/admin/whatsapp', ensureRole(['ADMIN']), whatsappController.getAdminPage);
app.get('/api/whatsapp/status', ensureRole(['ADMIN']), whatsappController.getStatusApi);
app.post('/api/whatsapp/reset', ensureRole(['ADMIN']), whatsappController.resetSession);

// TEMPORARY ENDPOINT FOR TESTING
const { runHMChecks } = require('./cron/hmCron');
app.get('/test-hm', async (req, res) => {
    try {
        console.log('--- TRIGGERED VIA API ---');
        await runHMChecks();
    } catch (e) {
        console.error(e);
    }
    res.send('HM checks run successfully');
});

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
    
    // Start background cron jobs
    startPMCron();
    startProcessingCron();
    startOfficeCron();
    startHMCron();
    // Start WhatsApp Service
    whatsappService.initialize();
});
