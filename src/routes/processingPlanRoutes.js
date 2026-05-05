const express = require('express');
const router = express.Router();
const processingPlanController = require('../controllers/processingPlanController');
const { ensureAuthenticated, ensureRole } = require('../middleware/authMiddleware');

// Page Route (Redirect to Master Data)
router.get('/', (req, res) => res.redirect('/admin/master'));

// API Routes
router.post('/api', ensureAuthenticated, ensureRole(['ADMIN', 'PROC']), processingPlanController.createProcessingPlan);
router.put('/api/:id', ensureAuthenticated, ensureRole(['ADMIN', 'PROC']), processingPlanController.editProcessingPlan);
router.delete('/api/:id', ensureAuthenticated, ensureRole(['ADMIN', 'PROC']), processingPlanController.deleteProcessingPlan);

module.exports = router;
