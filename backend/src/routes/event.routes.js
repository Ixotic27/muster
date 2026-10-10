const express = require('express');
const Joi = require('joi');
const { asyncHandler } = require('../utils/helpers');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole, requireEventAssignment } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { listEvents, getEvent, getPaymentIntent, eventStats, createEvent, updateEvent, listManageEvents, assignEventStaff, unassignEventStaff, eventRegistrations } = require('../controllers/event.controller');

const router = express.Router();
const eventSchema = Joi.object({
  slug: Joi.string().pattern(/^[a-z0-9-]+$/).required(), name: Joi.string().max(120).required(), description: Joi.string().max(5000).allow(''),
  category: Joi.string().valid('technical', 'non_technical', 'esports').required(), participationType: Joi.string().valid('solo', 'team', 'both').required(),
  minTeamSize: Joi.number().integer().min(1).max(100).required(), maxTeamSize: Joi.number().integer().min(Joi.ref('minTeamSize')).max(100).required(), feeInr: Joi.number().min(0).required(),
  registrationMode: Joi.string().valid('legacy', 'legacy'), teamFormationDeadline: Joi.date().iso().allow(null), paymentDeadline: Joi.date().iso().allow(null),
  prizePool: Joi.string().max(120).allow(''), eventDate: Joi.date().iso().required(), registrationDeadline: Joi.date().iso().allow(null), venue: Joi.string().max(200).required(),
  maxSlots: Joi.number().integer().min(1).allow(null), requiresNOC: Joi.boolean(), nocDocumentUrl: Joi.string().uri().allow(''), paymentUpiId: Joi.string().max(120).allow(''), paymentQrUrl: Joi.string().uri().allow(''),
  bannerImage: Joi.string().uri().allow(''), rules: Joi.array().items(Joi.string().max(1000)), status: Joi.string().valid('draft', 'published', 'closed', 'cancelled')
});
const eventPatchSchema = eventSchema.fork(Object.keys(eventSchema.describe().keys), (schema) => schema.optional()).keys({ maxTeamSize: Joi.number().integer().min(1).max(100) });

router.get('/', asyncHandler(listEvents));
router.get('/manage/all', authenticate, requireRole('organizer', 'admin', 'super_admin'), asyncHandler(listManageEvents));
router.get('/manage/:id/refunds', authenticate, requireRole('organizer', 'admin', 'super_admin'), requireEventAssignment('id'), asyncHandler(require('../controllers/admin.controller').refundQueue));
router.post('/manage/:id/refunds/:registrationId/approve', authenticate, requireRole('organizer', 'admin', 'super_admin'), requireEventAssignment('id'), validate(Joi.object({ confirmed: Joi.boolean().valid(true).required(), reference: Joi.string().trim().min(3).max(120).required(), paymentReceivedConfirmed: Joi.boolean() })), asyncHandler(require('../controllers/admin.controller').approveRefundRequest));
router.post('/manage/:id/refunds/:registrationId/reject', authenticate, requireRole('organizer', 'admin', 'super_admin'), requireEventAssignment('id'), validate(Joi.object({ reason: Joi.string().trim().min(3).max(500).required() })), asyncHandler(require('../controllers/admin.controller').rejectRefundRequest));
router.get('/manage/:id/roster/export', authenticate, requireRole('organizer', 'admin', 'super_admin'), requireEventAssignment('id'), asyncHandler(require('../controllers/participant-roster.controller').exportRoster));
router.get('/manage/:id/roster', authenticate, requireRole('organizer', 'admin', 'super_admin'), requireEventAssignment('id'), asyncHandler(require('../controllers/participant-roster.controller').roster));
router.patch('/manage/:id/registration-controls', authenticate, requireRole('organizer', 'admin', 'super_admin'), requireEventAssignment('id'), validate(Joi.object({ status: Joi.string().valid('published', 'closed'), registrationDeadline: Joi.date().iso().allow(null), maxSlots: Joi.number().integer().min(1).allow(null) }).min(1)), asyncHandler(require('../controllers/event.controller').registrationControls));
router.get('/manage/:id/registrations', authenticate, requireRole('organizer', 'admin', 'super_admin'), requireEventAssignment('id'), asyncHandler(eventRegistrations));
router.get('/:slug/payment-intent', asyncHandler(getPaymentIntent));
router.get('/:slug/stats', asyncHandler(eventStats));
router.get('/:slug', asyncHandler(getEvent));
router.post('/', authenticate, requireRole('admin', 'super_admin'), validate(eventSchema), asyncHandler(createEvent));
router.patch('/:id', authenticate, requireRole('admin', 'super_admin'), validate(eventPatchSchema.min(1)), asyncHandler(updateEvent));
router.post('/:id/assign', authenticate, requireRole('admin', 'super_admin'), validate(Joi.object({ userId: Joi.string().hex().length(24).required() })), asyncHandler(assignEventStaff));
router.post('/:id/unassign', authenticate, requireRole('admin', 'super_admin'), validate(Joi.object({ userId: Joi.string().hex().length(24).required() })), asyncHandler(unassignEventStaff));

module.exports = router;
