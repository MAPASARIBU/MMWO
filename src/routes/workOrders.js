const express = require('express');
const router = express.Router();
const workOrderController = require('../controllers/workOrderController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const upload = require('../utils/upload');

router.get('/', ensureAuthenticated, workOrderController.getWorkOrders);
router.post('/', ensureAuthenticated, upload.single('photo'), workOrderController.createWorkOrder);
router.get('/:id', ensureAuthenticated, workOrderController.getWorkOrderById);

router.post('/:id/materials', ensureAuthenticated, workOrderController.addMaterial);
router.delete('/:id/materials/:materialId', ensureAuthenticated, workOrderController.removeMaterial);

router.patch('/:id/status', ensureAuthenticated, workOrderController.updateStatus);
router.post('/:id/attachments', ensureAuthenticated, upload.single('file'), workOrderController.addAttachment);
router.post('/:id/comments', ensureAuthenticated, workOrderController.addComment);

// Bulk Create from Parts
router.post('/bulk/parts', ensureAuthenticated, workOrderController.bulkCreateFromParts);
router.post('/bulk/pms', ensureAuthenticated, workOrderController.bulkCreateFromPMs);

// Delete Work Order
router.delete('/:id', ensureAuthenticated, workOrderController.deleteWorkOrder);

// Assign PICs
router.post('/:id/pics', ensureAuthenticated, workOrderController.assignPics);

// TEST NOTIFICATION (Temporary)
router.get('/test-notification/:id', async (req, res) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const whatsappService = require('../services/whatsappService');
    
    try {
        const woId = parseInt(req.params.id);
        const wo = await prisma.workOrder.findUnique({ 
            where: { id: woId },
            include: { station: true, equipment: true, reporter: true }
        });
        if (!wo) return res.json({ error: 'WO not found' });
        
        let targetRoles = [];
        if (wo.category === 'Processing') {
            targetRoles = ['PROC', 'SPV', 'MANAGER'];
        } else {
            targetRoles = ['MTC', 'SPV', 'MANAGER'];
        }

        const targetUsers = await prisma.user.findMany({
            where: {
                mill_id: wo.mill_id,
                role: { in: targetRoles },
                is_active: true,
                phone: { not: null }
            }
        });
        
        const equipmentName = wo.equipment ? wo.equipment.name : '-';
        const stationName = wo.station ? wo.station.name : '-';
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const woLink = `${appUrl}/work-orders/${wo.id}`;
        
        const message = `*TEST WO BARU DIBUAT*\n\n` +
            `*No WO:* ${wo.wo_no}\n` +
            `*Kategori:* ${wo.category}\n` +
            `*Prioritas:* ${wo.priority}\n` +
            `*Station:* ${stationName}\n` +
            `*Equipment:* ${equipmentName}\n` +
            `*Pelapor:* ${wo.reporter ? wo.reporter.name : 'System'}\n\n` +
            `*Deskripsi Masalah:*\n${wo.description}\n\n` +
            `${woLink}`;

        const results = [];
        for (const targetUser of targetUsers) {
            if (targetUser.phone) {
                const success = await whatsappService.sendMessage(targetUser.phone, message);
                results.push({ user: targetUser.username, phone: targetUser.phone, success });
            }
        }

        res.json({ botStatus: whatsappService.getStatus(), wo_no: wo.wo_no, targetRoles, results });
    } catch (e) {
        res.json({ error: e.message });
    }
});

module.exports = router;
