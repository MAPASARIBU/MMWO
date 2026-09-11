const express = require('express');
const router = express.Router();
const masterController = require('../controllers/masterController');
const { ensureAuthenticated, ensureRole, ensurePermission } = require('../middleware/authMiddleware');

// Group routes
router.get('/mills', ensureAuthenticated, masterController.getMills);
router.post('/mills', ensureRole(['ADMIN']), masterController.createMill);

router.get('/stations', ensureAuthenticated, masterController.getStations);
router.post('/stations', ensurePermission('Master Data', 'input'), masterController.createStation);

router.get('/equipment', ensureAuthenticated, masterController.getEquipment);
router.post('/equipment', ensurePermission('Master Data', 'input'), masterController.createEquipment);

const equipmentController = require('../controllers/equipmentController');

router.post('/equipment/bulk', ensurePermission('Master Data', 'input'), equipmentController.bulkCreateEquipment);
router.put('/equipment/:id', ensurePermission('Master Data', 'edit'), equipmentController.updateEquipment);
router.delete('/equipment/:id', ensurePermission('Master Data', 'delete'), equipmentController.deleteEquipment);

module.exports = router;
