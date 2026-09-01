const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

router.get('/', ensureAuthenticated, (req, res) => {
    res.redirect('/weekly-plan?tab=monitoring');
});
router.get('/:type', ensureAuthenticated, (req, res) => {
    const type = (req.params.type || '').toLowerCase();
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const connector = query ? '&' : '?';
    if (type === 'processing') {
        res.redirect(`/weekly-plan/processing${query}${connector}tab=monitoring`);
    } else if (type === 'civil') {
        res.redirect(`/weekly-plan/civil${query}${connector}tab=monitoring`);
    } else if (type === 'office') {
        res.redirect(`/weekly-plan/office${query}${connector}tab=monitoring`);
    } else {
        res.redirect(`/weekly-plan${query}${connector}tab=monitoring`);
    }
});

module.exports = router;
