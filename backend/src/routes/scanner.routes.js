const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole, requireEventAssignment } = require('../middleware/role.middleware');
const { asyncHandler } = require('../utils/helpers');
const { validate } = require('../middleware/validate.middleware');
const { verifyTicket, stats } = require('../controllers/scanner.controller');

const router = express.Router();
router.use(authenticate, requireRole('organizer', 'admin', 'super_admin'));
router.post('/verify', validate(Joi.object({ token: Joi.string().min(20).max(4000).required(), eventId: Joi.string().hex().length(24).required(), scanId: Joi.string().max(100) })), requireEventAssignment(), asyncHandler(verifyTicket));
router.get('/stats/:eventId', requireEventAssignment(), asyncHandler(stats));

module.exports = router;
