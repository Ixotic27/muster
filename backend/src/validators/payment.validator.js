const Joi = require('joi');

const paymentSchema = Joi.object({
  registrationId: Joi.string().hex().length(24).required(),
  utr: Joi.string().trim().uppercase().pattern(/^\d{8,22}$/).required()
});

module.exports = { paymentSchema };
