const express = require('express');
const router = express.Router();
const masterController = require('../controllers/masterController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

// Group routes
router.get('/mills', ensureAuthenticated, masterController.getMills);
router.post('/mills', ensureAuthenticated, masterController.createMill);

router.get('/stations', ensureAuthenticated, masterController.getStations);
router.post('/stations', ensureAuthenticated, masterController.createStation);

router.get('/equipment', ensureAuthenticated, masterController.getEquipment);
router.post('/equipment', ensureAuthenticated, masterController.createEquipment);

const equipmentController = require('../controllers/equipmentController');
const { ensureRole } = require('../middleware/authMiddleware');

router.post('/equipment/bulk', ensureRole(['ADMIN']), equipmentController.bulkCreateEquipment);

module.exports = router;
