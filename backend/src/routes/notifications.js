const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const c = require('../controllers/notificationController');

router.use(authenticate);
router.get('/settings', requireRole('dono'), asyncHandler(c.getNotificationSettings));
router.put('/settings', requireRole('dono'), asyncHandler(c.updateNotificationSettings));
router.post('/settings/test', requireRole('dono'), asyncHandler(c.testConnection));
router.get('/log', requireRole('gerente'), asyncHandler(c.getNotificationLog));

module.exports = router;
