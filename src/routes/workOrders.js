const express = require('express');
const router = express.Router();
const workOrderController = require('../controllers/workOrderController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const upload = require('../utils/upload');

router.get('/', ensureAuthenticated, workOrderController.getWorkOrders);
router.post('/', ensureAuthenticated, upload.single('photo'), workOrderController.createWorkOrder);
router.get('/:id', ensureAuthenticated, workOrderController.getWorkOrderById);

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
    try {
        const woId = parseInt(req.params.id);
        const wo = await prisma.workOrder.findUnique({ where: { id: woId } });
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
        
        res.json({ wo, targetRoles, targetUsers });
    } catch (e) {
        res.json({ error: e.message });
    }
});

module.exports = router;
