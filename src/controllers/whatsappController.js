const whatsappService = require('../services/whatsappService');
const { renderView } = require('./indexController');

const getAdminPage = async (req, res) => {
    try {
        const statusData = whatsappService.getStatus();
        
        res.render('layout', {
            title: 'WhatsApp Bot Configuration',
            body: await renderView('admin/whatsapp', { status: statusData.status, qr: statusData.qr, error: statusData.error }),
            user: req.session.user,
            path: '/admin/whatsapp'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading WhatsApp admin page');
    }
};

const getStatusApi = async (req, res) => {
    res.json(whatsappService.getStatus());
};

const resetSession = async (req, res) => {
    try {
        await whatsappService.logout();
        res.json({ success: true, message: 'Session reset initiated.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to reset session.' });
    }
};

module.exports = {
    getAdminPage,
    getStatusApi,
    resetSession
};
