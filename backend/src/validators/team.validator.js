const Joi = require('joi');

const createTeamSchema = Joi.object({ eventId: Joi.string().hex().length(24).required(), teamName: Joi.string().trim().min(2).max(80).required() });
const joinTeamSchema = Joi.object({ joinCode: Joi.string().trim().min(4).max(20).required() });
const inviteSchema = Joi.object({ email: Joi.string().email(), studentId: Joi.string().max(40) }).or('email', 'studentId');

module.exports = { createTeamSchema, joinTeamSchema, inviteSchema };
