const Joi = require('joi');

const eventSchema = Joi.object({
  slug: Joi.string().trim().pattern(/^[a-z0-9-]+$/).required(),
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().max(5000).allow(''),
  category: Joi.string().valid('technical', 'non_technical', 'esports').required(),
  participationType: Joi.string().valid('solo', 'team', 'both').required(),
  minTeamSize: Joi.number().integer().min(1).max(100).required(),
  maxTeamSize: Joi.number().integer().min(Joi.ref('minTeamSize')).max(100).required(),
  feeInr: Joi.number().integer().min(0).max(1000000).required(),
  registrationMode: Joi.string().valid('legacy', 'legacy'),
  teamFormationDeadline: Joi.date().iso().allow(null),
  paymentDeadline: Joi.date().iso().allow(null),
  prizePool: Joi.string().max(120).allow(''),
  eventDate: Joi.date().iso().required(),
  registrationDeadline: Joi.date().iso().allow(null),
  venue: Joi.string().trim().max(200).required(),
  maxSlots: Joi.number().integer().min(1).allow(null),
  requiresNOC: Joi.boolean(),
  nocDocumentUrl: Joi.string().uri().allow(''),
  paymentUpiId: Joi.string().trim().max(120).allow(''),
  paymentQrUrl: Joi.string().uri().allow(''),
  bannerImage: Joi.string().uri().allow(''),
  rules: Joi.array().items(Joi.string().max(1000)).max(100),
  status: Joi.string().valid('draft', 'published', 'closed', 'cancelled')
});

module.exports = { eventSchema, eventPatchSchema: eventSchema.fork(Object.keys(eventSchema.describe().keys), (schema) => schema.optional()) };
