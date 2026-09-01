const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

router.get('/', ensureAuthenticated, (req, res) => res.redirect('/weekly-plan?tab=analytics'));

module.exports = router;
