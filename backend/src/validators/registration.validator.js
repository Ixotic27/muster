const Joi = require('joi');

const registrationSchema = Joi.object({
  eventId: Joi.string().hex().length(24).required(),
  teamId: Joi.string().hex().length(24).allow(null)
});
const cancellationSchema = Joi.object({ reason: Joi.string().trim().max(500).allow('') });

module.exports = { registrationSchema, cancellationSchema };
