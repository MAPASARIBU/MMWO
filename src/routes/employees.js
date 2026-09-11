const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { ensureAuthenticated, ensureRole, ensurePermission } = require('../middleware/authMiddleware');

router.post('/', ensurePermission('Labour Employees', 'input'), employeeController.createEmployee);
router.put('/:id', ensurePermission('Labour Employees', 'edit'), employeeController.updateEmployee);
router.delete('/:id', ensurePermission('Labour Employees', 'delete'), employeeController.deleteEmployee);
router.get('/', ensureAuthenticated, employeeController.getEmployees);

module.exports = router;
