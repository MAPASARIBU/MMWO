const express = require('express');
const router = express.Router();
const equipmentPartsController = require('../controllers/equipmentPartsController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

// Part routes
router.get('/:equipmentId/parts', ensureAuthenticated, equipmentPartsController.getParts);
router.post('/:equipmentId/parts', ensureAuthenticated, equipmentPartsController.createPart);
router.post('/:equipmentId/parts/:partId/replace', ensureAuthenticated, equipmentPartsController.replacePart);

// HM Record routes
router.get('/:equipmentId/hm', ensureAuthenticated, equipmentPartsController.getHMRecords);
router.post('/:equipmentId/hm', ensureAuthenticated, equipmentPartsController.recordHM);

module.exports = router;
