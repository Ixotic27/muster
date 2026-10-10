const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../utils/helpers');
const { validate } = require('../middleware/validate.middleware');
const { upload, } = require('../middleware/upload.middleware');
const { paymentLimiter } = require('../middleware/rateLimiter.middleware');
const { submitPayment, listMyPayments, getPayment, getPaymentScreenshot } = require('../controllers/payment.controller');

const router = express.Router();
router.use(authenticate);
router.get('/intent/:registrationId', asyncHandler(require('../controllers/payment.controller').paymentIntent));
router.post('/', paymentLimiter, upload.single('screenshot'), validate(Joi.object({ registrationId: Joi.string().hex().length(24).required(), utr: Joi.string().trim().pattern(/^\d{8,22}$/).required() })), asyncHandler(submitPayment));
router.get('/mine', asyncHandler(listMyPayments));
router.get('/:id', asyncHandler(getPayment));
router.get('/:id/screenshot', asyncHandler(getPaymentScreenshot));

module.exports = router;
