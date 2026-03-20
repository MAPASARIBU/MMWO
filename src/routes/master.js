const express = require('express');
const router = express.Router();
const masterController = require('../controllers/masterController');
const { ensureAuthenticated, ensureRole } = require('../middleware/authMiddleware');

// Group routes
router.get('/mills', ensureAuthenticated, masterController.getMills);
router.post('/mills', ensureRole(['ADMIN']), masterController.createMill);

router.get('/stations', ensureAuthenticated, masterController.getStations);
router.post('/stations', ensureRole(['ADMIN']), masterController.createStation);

router.get('/equipment', ensureAuthenticated, masterController.getEquipment);
router.post('/equipment', ensureRole(['ADMIN']), masterController.createEquipment);

const equipmentController = require('../controllers/equipmentController');

router.post('/equipment/bulk', ensureRole(['ADMIN']), equipmentController.bulkCreateEquipment);

module.exports = router;
