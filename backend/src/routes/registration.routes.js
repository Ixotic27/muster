const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../utils/helpers');
const { validate } = require('../middleware/validate.middleware');
const { createRegistration, listMyRegistrations, getRegistration, getRegistrationMembers, listMyPasses, cancelRegistration } = require('../controllers/registration.controller');

const router = express.Router();
router.use(authenticate);
router.post('/', validate(Joi.object({ eventId: Joi.string().hex().length(24).required(), teamId: Joi.string().hex().length(24) })), asyncHandler(createRegistration));
router.get('/mine', asyncHandler(listMyRegistrations));
router.get('/passes/mine', asyncHandler(listMyPasses));
router.post('/:id/cancel', validate(Joi.object({ reason: Joi.string().trim().max(500).allow('') })), asyncHandler(cancelRegistration));
router.post('/:id/refund-request', validate(Joi.object({ reason: Joi.string().trim().max(500).allow('') })), asyncHandler(cancelRegistration));
router.get('/:id/members', asyncHandler(getRegistrationMembers));
router.get('/:id', asyncHandler(getRegistration));

module.exports = router;
