const express = require('express');
const router = express.Router();
const equipmentPartsController = require('../controllers/equipmentPartsController');
const { ensureAuthenticated, ensureRole } = require('../middleware/authMiddleware');

// Part routes
router.get('/:equipmentId/parts', ensureAuthenticated, equipmentPartsController.getParts);
router.post('/:equipmentId/parts', ensureRole(['ADMIN']), equipmentPartsController.createPart);
router.post('/:equipmentId/parts/:partId/replace', ensureRole(['ADMIN']), equipmentPartsController.replacePart);
router.put('/:equipmentId/parts/:partId', ensureRole(['ADMIN']), equipmentPartsController.editPart);
router.delete('/:equipmentId/parts/:partId', ensureRole(['ADMIN']), equipmentPartsController.deletePart);

// HM Record routes
router.get('/:equipmentId/hm', ensureAuthenticated, equipmentPartsController.getHMRecords);
router.post('/:equipmentId/hm', ensureRole(['ADMIN', 'proc']), equipmentPartsController.recordHM);

module.exports = router;
