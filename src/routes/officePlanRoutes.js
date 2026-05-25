const express = require('express');
const router = express.Router();
const officePlanController = require('../controllers/officePlanController');
const { ensureRole } = require('../middleware/authMiddleware');

router.post('/', ensureRole(['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA']), officePlanController.createOfficePlan);
router.post('/bulk-create', ensureRole(['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA']), officePlanController.bulkCreateOfficeWOs);
router.put('/:id', ensureRole(['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA']), officePlanController.editOfficePlan);
router.delete('/:id', ensureRole(['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA']), officePlanController.deleteOfficePlan);

module.exports = router;
