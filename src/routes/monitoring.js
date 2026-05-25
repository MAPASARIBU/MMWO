const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, monitoringController.getMonitoringPage);

module.exports = router;
