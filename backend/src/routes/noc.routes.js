const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { asyncHandler } = require('../utils/helpers');
const { validate } = require('../middleware/validate.middleware');
const { nocUpload } = require('../middleware/upload.middleware');
const { submitNoc, getMyNoc, pendingNoc, getNocDocument, verifyNocDocument, rejectNocDocument } = require('../controllers/noc.controller');

const router = express.Router();
router.use(authenticate);
router.get('/mine/:registrationId', asyncHandler(getMyNoc));
router.post('/:registrationId', nocUpload.single('document'), asyncHandler(submitNoc));
router.get('/admin/pending', requireRole('admin', 'super_admin'), asyncHandler(pendingNoc));
router.get('/admin/:registrationId/document', requireRole('admin', 'super_admin'), asyncHandler(getNocDocument));
router.post('/admin/:registrationId/verify', requireRole('admin', 'super_admin'), asyncHandler(verifyNocDocument));
router.post('/admin/:registrationId/reject', requireRole('admin', 'super_admin'), validate(Joi.object({ reason: Joi.string().trim().min(3).max(500).required() })), asyncHandler(rejectNocDocument));

module.exports = router;
