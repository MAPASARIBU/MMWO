const express = require('express');
const router = express.Router();
const officePlanController = require('../controllers/officePlanController');
const { requireRole } = require('../middleware/authMiddleware');

router.post('/', requireRole(['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA']), officePlanController.createOfficePlan);
router.post('/bulk-create', requireRole(['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA']), officePlanController.bulkCreateOfficeWOs);
router.put('/:id', requireRole(['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA']), officePlanController.editOfficePlan);
router.delete('/:id', requireRole(['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA']), officePlanController.deleteOfficePlan);

module.exports = router;
