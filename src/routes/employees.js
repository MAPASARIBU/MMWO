const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { ensureAuthenticated, ensureRole } = require('../middleware/authMiddleware');

router.post('/', ensureRole(['ADMIN']), employeeController.createEmployee);
router.put('/:id', ensureRole(['ADMIN']), employeeController.updateEmployee);
router.delete('/:id', ensureRole(['ADMIN']), employeeController.deleteEmployee);
router.get('/', ensureAuthenticated, employeeController.getEmployees);

module.exports = router;
