const Joi = require('joi');

const profileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  studentId: Joi.string().trim().max(40).allow(''),
  college: Joi.string().trim().max(120).allow(''),
  course: Joi.string().trim().max(120).allow(''),
  specialization: Joi.string().trim().max(120).allow(''),
  section: Joi.string().trim().max(40).allow(''),
  year: Joi.number().integer().min(1).max(8).allow(null),
  phone: Joi.string().trim().max(20).allow(''),
  avatar: Joi.string().uri().allow('')
}).min(1);

module.exports = { profileSchema };
