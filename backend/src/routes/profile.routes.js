const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../utils/helpers');
const { validate } = require('../middleware/validate.middleware');
const { getProfile, updateProfile, changePassword, searchStudents } = require('../controllers/profile.controller');
const { profileSchema } = require('../validators/profile.validator');

const router = express.Router();
router.use(authenticate);
router.get('/', asyncHandler(getProfile));
router.get('/search', asyncHandler(searchStudents));
router.patch('/', validate(profileSchema), asyncHandler(updateProfile));
router.post('/password', validate(Joi.object({ currentPassword: Joi.string().allow(''), newPassword: Joi.string().min(8).max(128).required() })), asyncHandler(changePassword));

module.exports = router;
