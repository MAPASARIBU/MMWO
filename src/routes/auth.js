const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const { ensureAuthenticated } = require('../middleware/authMiddleware');

router.get('/login', authController.loginPage);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

router.get('/change-password', ensureAuthenticated, authController.changePasswordPage);
router.post('/change-password', ensureAuthenticated, authController.changePassword);

module.exports = router;
