const { Event, User } = require('../models');
const { fail } = require('../utils/operations');
const { isValidObjectId } = require('../utils/helpers');
const { participantRoster, rosterCsv, rosterFilter, eventSummary } = require('../services/participant-roster.service');

async function scope(req) {
  const eventId = req.params.id || req.query.eventId;
  if (!eventId) return { eventId: null, event: null };
  if (!isValidObjectId(eventId)) throw fail(400, 'Invalid event ID');
  const event = await Event.findById(eventId).lean();
  if (!event) throw fail(404, 'Event not found');
  return { eventId, event };
}
async function roster(req, res) {
  const { eventId, event } = await scope(req);
  const result = await participantRoster(req.query, eventId);
  const staff = eventId ? await User.find({ assignedEvents: eventId, isActive: true, role: { $in: ['organizer', 'admin', 'super_admin'] } }).select('name email role').lean() : [];
  return res.json({ success: true, ...result, ...(event ? { event: eventSummary(event) } : {}), staff });
}
async function exportRoster(req, res) {
  const { eventId, event } = await scope(req);
  // Downloads always cover the entire filtered roster, irrespective of the UI page.
  const result = await participantRoster({ ...req.query, page: 1, limit: 100 }, eventId, { exportAll: true });
  const filename = (event?.slug || 'all-events') + '-' + rosterFilter(req.query) + '-participants.csv';
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="' + filename.replace(/[^a-z0-9_.-]/gi, '-') + '"');
  res.set('Cache-Control', 'private, no-store');
  return res.send(rosterCsv(result.groups));
}
module.exports = { roster, exportRoster };
