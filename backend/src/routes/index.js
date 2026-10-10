const express = require('express');

const router = express.Router();
router.use('/jobs', require('./jobs.routes'));
router.use('/files', require('./file.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/events', require('./event.routes'));
router.use('/teams', require('./team.routes'));
router.use('/registrations', require('./registration.routes'));
router.use('/payments/gateway', require('./gateway.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/scanner', require('./scanner.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/config', require('./config.routes'));
router.use('/profile', require('./profile.routes'));
router.use('/noc', require('./noc.routes'));
router.use('/passes', require('./pass.routes'));

module.exports = router;
