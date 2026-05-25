const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

router.get('/', ensureAuthenticated, (req, res) => {
    res.redirect('/monitoring/maintenance');
});
router.get('/:type', ensureAuthenticated, monitoringController.getMonitoringPage);

module.exports = router;
