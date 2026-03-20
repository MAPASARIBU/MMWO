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

// Delete Work Order
router.delete('/:id', ensureAuthenticated, workOrderController.deleteWorkOrder);

// Assign PICs
router.post('/:id/pics', ensureAuthenticated, workOrderController.assignPics);

module.exports = router;
