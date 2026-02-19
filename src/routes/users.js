const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { ensureRole } = require('../middleware/authMiddleware');

router.get('/', ensureRole(['ADMIN']), userController.getUsers);
router.post('/', ensureRole(['ADMIN']), userController.createUser);
router.patch('/:id/active', ensureRole(['ADMIN']), userController.toggleActive);

module.exports = router;
