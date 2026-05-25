const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

router.get('/', ensureAuthenticated, monitoringController.getMonitoringPage);

module.exports = router;
