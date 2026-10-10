const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { asyncHandler } = require('../utils/helpers');
const { listMyPasses, getPass, revokePass } = require('../controllers/pass.controller');

const router = express.Router();
router.use(authenticate);
router.get('/mine', asyncHandler(listMyPasses));
router.get('/:id', asyncHandler(getPass));
router.post('/:id/revoke', requireRole('admin', 'super_admin'), validate(Joi.object({ reason: Joi.string().trim().max(500).allow('') })), asyncHandler(revokePass));

module.exports = router;
