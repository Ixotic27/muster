const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../utils/helpers');
const { listNotifications, markNotificationRead, markAllNotificationsRead } = require('../controllers/notification.controller');

const router = express.Router();
router.use(authenticate);
router.get('/', asyncHandler(listNotifications));
router.post('/read-all', asyncHandler(markAllNotificationsRead));
router.post('/:id/read', asyncHandler(markNotificationRead));

module.exports = router;
