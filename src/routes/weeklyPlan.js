const express = require('express');
const router = express.Router();
const weeklyPlanController = require('../controllers/weeklyPlanController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

router.post('/', ensureAuthenticated, weeklyPlanController.upsertPlan);
router.post('/bulk', ensureAuthenticated, weeklyPlanController.bulkPlan);
router.get('/', ensureAuthenticated, weeklyPlanController.getPlans);

module.exports = router;
