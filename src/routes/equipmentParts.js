const express = require('express');
const router = express.Router();
const equipmentPartsController = require('../controllers/equipmentPartsController');
const periodicPMController = require('../controllers/periodicPMController');
const { ensureAuthenticated, ensureRole } = require('../middleware/authMiddleware');

// Part routes
router.get('/:equipmentId/parts', ensureAuthenticated, equipmentPartsController.getParts);
router.post('/:equipmentId/parts', ensureRole(['ADMIN', 'MTC', 'PROC', 'SPV', 'MANAGER']), equipmentPartsController.createPart);
router.post('/:equipmentId/parts/:partId/replace', ensureRole(['ADMIN', 'MTC', 'PROC', 'SPV', 'MANAGER']), equipmentPartsController.replacePart);
router.put('/:equipmentId/parts/:partId', ensureRole(['ADMIN', 'MTC', 'PROC', 'SPV', 'MANAGER']), equipmentPartsController.editPart);
router.delete('/:equipmentId/parts/:partId', ensureRole(['ADMIN', 'MTC', 'PROC', 'SPV', 'MANAGER']), equipmentPartsController.deletePart);

// HM Record routes
router.get('/:equipmentId/hm', ensureAuthenticated, equipmentPartsController.getHMRecords);
router.post('/:equipmentId/hm', ensureRole(['ADMIN', 'PROC', 'OPERATOR']), equipmentPartsController.recordHM);

// Periodic PM routes
router.get('/:equipmentId/periodic-pms', ensureAuthenticated, periodicPMController.getPeriodicPMs);
router.post('/:equipmentId/periodic-pms', ensureRole(['ADMIN', 'MTC', 'PROC']), periodicPMController.createPeriodicPM);
router.put('/:equipmentId/periodic-pms/:pmId', ensureRole(['ADMIN', 'MTC', 'PROC']), periodicPMController.editPeriodicPM);
router.delete('/:equipmentId/periodic-pms/:pmId', ensureRole(['ADMIN', 'MTC', 'PROC']), periodicPMController.deletePeriodicPM);

module.exports = router;
