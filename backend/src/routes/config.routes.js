const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { asyncHandler } = require('../utils/helpers');
const { getPublicConfig, listConfig, upsertConfig } = require('../controllers/config.controller');

const router = express.Router();
router.get('/', asyncHandler(getPublicConfig));
router.get('/admin', authenticate, requireRole('admin', 'super_admin'), asyncHandler(listConfig));
router.put('/:key', authenticate, requireRole('admin', 'super_admin'), validate(Joi.object({ value: Joi.any().required(), description: Joi.string().max(500).allow(''), isPublic: Joi.boolean() })), asyncHandler(upsertConfig));

module.exports = router;
