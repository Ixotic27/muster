const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../utils/helpers');
const { validate } = require('../middleware/validate.middleware');
const { createTeam, getTeam, joinTeam, listMyTeams, leaveTeam, listInvites } = require('../controllers/team.controller');
const { inviteMember, previewInvite, respondInvite } = require('../controllers/invitation.controller');

const router = express.Router();
router.use(authenticate);
router.post('/', validate(Joi.object({ eventId: Joi.string().hex().length(24).required(), teamName: Joi.string().trim().min(2).max(80).required() })), asyncHandler(createTeam));
router.post('/join', validate(Joi.object({ joinCode: Joi.string().trim().min(4).max(20).required(), eventId: Joi.string().hex().length(24) })), asyncHandler(joinTeam));
router.get('/mine', asyncHandler(listMyTeams));
router.get('/invites', asyncHandler(listInvites));
router.post('/:id/invites', validate(Joi.object({ email: Joi.string().email(), studentId: Joi.string().max(40) }).or('email', 'studentId')), asyncHandler(inviteMember));
router.post('/invites/:inviteId/preview', asyncHandler(previewInvite));
router.post('/invites/:inviteId/:action(accept|reject)', asyncHandler(respondInvite));
router.post('/:id/leave', asyncHandler(leaveTeam));
router.delete('/:id', asyncHandler(require('../controllers/team.controller').deleteTeam));
router.get('/:id', asyncHandler(getTeam));

module.exports = router;
