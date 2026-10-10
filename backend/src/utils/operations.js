const { User, Team } = require('../models');
const { isValidObjectId } = require('./helpers');

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const isAdmin = user => ['admin', 'super_admin'].includes(user.role);
function pagination(query) {
  const page = Number(query.page || 1), limit = Number(query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw fail(400, 'Invalid page or limit (1–100)');
  return { page, limit, skip: (page - 1) * limit };
}
function pageInfo(total, { page, limit }) { return { total, page, limit, pages: Math.ceil(total / limit) }; }
function searchRegex(value) {
  if (!value) return null;
  return new RegExp(String(value).trim().slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
async function registrationFilter(query, base = {}) {
  const filter = { ...base };
  if (query.eventId) {
    if (!isValidObjectId(query.eventId)) throw fail(400, 'Invalid event ID');
    filter.eventId = query.eventId;
  }
  if (query.status) {
    const statuses = require('../models/Registration').schema.path('status').enumValues;
    if (!statuses.includes(query.status)) throw fail(400, 'Invalid registration status');
    filter.status = query.status;
  }
  const regex = searchRegex(query.q);
  if (regex) {
    const users = await User.find({ $or: [{ name: regex }, { email: regex }, { studentId: regex }] }).select('_id').lean();
    const teams = await Team.find({ teamName: regex }).select('_id').lean();
    filter.$or = [{ regId: regex }, { leaderId: { $in: users.map(u => u._id) } }, { teamId: { $in: teams.map(t => t._id) } }];
  }
  return filter;
}
module.exports = { fail, isAdmin, pagination, pageInfo, searchRegex, registrationFilter };
