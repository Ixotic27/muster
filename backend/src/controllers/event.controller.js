const { Event, User, Registration, Pass, AdminAction } = require('../models');
const { fail, isAdmin, pagination, pageInfo, registrationFilter } = require('../utils/operations');
const mongoose = require('mongoose');
const { registrationIsOpen, registrationAvailability } = require('../utils/eventAvailability');
const { certificateRecipientFields, certificateTeamPopulation, certificateRegistration } = require('../utils/academicProfile');

function checkEvent(value) {
  if (value.minTeamSize > value.maxTeamSize) throw fail(400, 'Minimum team size cannot exceed maximum team size');
  if (value.participationType === 'solo' && (value.minTeamSize !== 1 || value.maxTeamSize !== 1)) throw fail(400, 'Solo events must have a team size of 1');
  if (value.registrationDeadline && new Date(value.registrationDeadline) > new Date(value.eventDate)) throw fail(400, 'Registration deadline must be on or before the event');
  for (const key of ['teamFormationDeadline', 'paymentDeadline']) if (value[key] && new Date(value[key]) > new Date(value.eventDate)) throw fail(400, key + ' must be on or before the event starts');
}
async function audit(req, action, targetId, details = {}, session) {
  await AdminAction.create([{ actorId: req.user._id, action, targetType: 'event', targetId, details, requestId: req.id }], { session });
}

async function listEvents(req, res) {
  const filter = { status: req.query.includeDraft === 'true' && ['admin', 'super_admin'].includes(req.user?.role) ? { $in: ['draft', 'published', 'closed'] } : { $in: ['published', 'closed'] } };
  const events = await Event.find(filter).sort({ eventDate: 1, name: 1 }).lean();
  return res.json({ success: true, events: events.map(event => ({ ...event, availability: registrationAvailability(event) })) });
}

async function getEvent(req, res) {
  const event = await Event.findOne({ slug: req.params.slug }).lean();
  if (!event || (!['published', 'closed'].includes(event.status) && !['admin', 'super_admin'].includes(req.user?.role))) return res.status(404).json({ success: false, message: 'Event not found' });
  return res.json({ success: true, event: { ...event, availability: registrationAvailability(event) } });
}

async function getPaymentIntent(req, res) {
  const event = await Event.findOne({ slug: req.params.slug, status: 'published' }).lean();
  if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
  if (!registrationIsOpen(event)) throw fail(409, 'Event registration is closed');
  if (process.env.ENABLE_MANUAL_PAYMENTS !== 'true') throw fail(503, 'Manual payments are not enabled');
  const amount = event.feeInr;
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: 'Invalid payment amount' });
  const pa = event.paymentUpiId || process.env.PAYMENT_UPI_ID;
  if (!pa) return res.status(503).json({ success: false, message: 'Payment UPI is not configured' });
  const params = new URLSearchParams({ pa, pn: process.env.PAYMENT_UPI_NAME || 'EventFlow', am: amount.toFixed(2), cu: 'INR', tn: String(req.query.note || `EventFlow-${event.slug}`).slice(0, 80) });
  return res.json({ success: true, eventId: event._id, amountInr: amount, upiId: pa, intentUrl: `upi://pay?${params.toString()}`, qrUrl: event.paymentQrUrl || null });
}

async function eventStats(req, res) {
  const event = await Event.findOne({ slug: req.params.slug, status: { $in: ['published', 'closed'] } }).select('name slug maxSlots filledSlots personalFilledSlots participationType eventDate registrationMode registrationDeadline status').lean();
  if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
  return res.json({ success: true, stats: { ...event, availability: registrationAvailability(event), remainingSlots: event.maxSlots ? Math.max(event.maxSlots - event.filledSlots, 0) : null,
 } });
}

async function createEvent(req, res) {
  checkEvent(req.body);
  if (req.body.participationType === 'solo' && (req.body.minTeamSize !== 1 || req.body.maxTeamSize !== 1)) return res.status(400).json({ success: false, message: 'Solo events must have a team size of 1' });
  const event = await Event.create(req.body);
  await audit(req, 'event_created', event._id);
  return res.status(201).json({ success: true, event: { ...event.toObject(), availability: registrationAvailability(event) } });
}

async function updateEvent(req, res) {
  let event;
  await mongoose.connection.transaction(async session => {
    const current = await Event.findOneAndUpdate({ _id: req.params.id }, { $inc: { __v: 1 } }, { new: true, session });
    if (!current) throw fail(404, 'Event not found');
    checkEvent({ ...current.toObject(), ...req.body });
    const hasRegistrations = await Registration.exists({ eventId: current._id }).session(session);
    if (hasRegistrations && ['participationType', 'minTeamSize', 'maxTeamSize', 'requiresNOC', 'eventDate'].some(key => req.body[key] !== undefined && String(req.body[key] instanceof Date ? req.body[key].toISOString() : req.body[key]) !== String(current[key] instanceof Date ? current[key].toISOString() : current[key]))) throw fail(409, 'Team rules, NOC requirements and the event date cannot change after registration begins');
    // Older unlimited events did not maintain filledSlots. Recount under the
    // event lock before applying a new capacity limit.
    const activeFilter = { eventId: current._id, $or: [{ status: { $nin: ['cancelled', 'refund_requested', 'refunded'] } }, { status: 'refund_requested', refundCapacityReserved: true }] };
    const filledSlots = await Registration.countDocuments(activeFilter).session(session);
    const maxSlots = req.body.maxSlots === undefined ? current.maxSlots : req.body.maxSlots;
    if (maxSlots != null && maxSlots < filledSlots) throw fail(409, `maxSlots cannot be lower than the ${filledSlots} registrations already reserved`);
    event = await Event.findByIdAndUpdate(current._id, { $set: { ...req.body, filledSlots } }, { new: true, runValidators: true, session });
    await audit(req, 'event_updated', event._id, { fields: Object.keys(req.body) }, session);
  });
  return res.json({ success: true, event: { ...event.toObject(), availability: registrationAvailability(event) } });
}

async function listManageEvents(req, res) {
  const filter = isAdmin(req.user) ? {} : { _id: { $in: req.user.assignedEvents || [] } };
  const events = await Event.find(filter).sort({ eventDate: 1, name: 1 }).lean();
  const ids = events.map(e => e._id);
  const counts = await Pass.aggregate([{ $match: { eventId: { $in: ids }, status: 'issued' } }, { $group: { _id: '$eventId', issued: { $sum: 1 }, checkedIn: { $sum: { $cond: [{ $eq: ['$checkInStatus', 'checked_in'] }, 1, 0] } } } }]);
  return res.json({ success: true, events: events.map(e => {
    const c = counts.find(row => String(row._id) === String(e._id));
    if (!isAdmin(req.user)) { delete e.paymentUpiId; delete e.paymentQrUrl; delete e.nocDocumentUrl; }
    return { ...e, availability: registrationAvailability(e), issuedPasses: c?.issued || 0, checkedIn: c?.checkedIn || 0 };
  }) });
}

async function assignEventStaff(req, res) {
  const event = await Event.findById(req.params.id).select('_id');
  if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
  const user = await User.findById(req.body.userId).select('_id role name email assignedEvents isActive');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (!user.isActive) throw fail(409, 'Inactive accounts cannot be assigned to events');
  if (!['student', 'organizer', 'admin', 'super_admin'].includes(user.role)) return res.status(409).json({ success: false, message: 'Only active participant accounts can be assigned to events' });
  await User.updateOne({ _id: user._id, isActive: true }, [{ $set: { assignedEvents: { $setUnion: [{ $ifNull: ['$assignedEvents', []] }, [event._id]] }, role: { $cond: [{ $eq: ['$role', 'student'] }, 'organizer', '$role'] } } }]);
  await audit(req, 'staff_assigned', event._id, { userId: user._id });
  return res.json({ success: true, user: await User.findById(user._id).select('-passwordHash -__v').lean() });
}

async function unassignEventStaff(req, res) {
  if (!await Event.exists({ _id: req.params.id })) throw fail(404, 'Event not found');
  const user = await User.findByIdAndUpdate(req.body.userId, { $pull: { assignedEvents: req.params.id } }, { new: true }).select('-passwordHash -__v').lean();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  await audit(req, 'staff_unassigned', req.params.id, { userId: user._id });
  return res.json({ success: true, user });
}

async function eventRegistrations(req, res) {
  const event = await Event.findById(req.params.id).select('_id name slug');
  if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
  const paging = pagination(req.query);
  const filter = await registrationFilter({ ...req.query, eventId: String(event._id) });
  const [registrations, total, passes, staff] = await Promise.all([
    Registration.find(filter).select('regId eventId leaderId teamId billingMode feeSnapshotInr status nocStatus createdAt').populate('leaderId', certificateRecipientFields).populate(certificateTeamPopulation).sort({ createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    Registration.countDocuments(filter),
    Pass.aggregate([{ $match: { eventId: event._id, status: 'issued' } }, { $group: { _id: null, total: { $sum: 1 }, checkedIn: { $sum: { $cond: [{ $eq: ['$checkInStatus', 'checked_in'] }, 1, 0] } } } }]),
    User.find({ assignedEvents: event._id, isActive: true, role: { $in: ['organizer', 'admin', 'super_admin'] } }).select('name email role').lean()
  ]);
  const rows = registrations.map(certificateRegistration);
  return res.json({ success: true, event, registrations: rows, staff, pagination: pageInfo(total, paging), stats: { total: passes[0]?.total || 0, checkedIn: passes[0]?.checkedIn || 0 } });
}

async function registrationControls(req, res) {
  if (!require('../utils/helpers').isValidObjectId(req.params.id)) throw fail(400, 'Invalid event ID');
  let event;
  await mongoose.connection.transaction(async session => {
    const current = await Event.findOneAndUpdate({ _id: req.params.id }, { $inc: { __v: 1 } }, { new: true, session });
    if (!current) throw fail(404, 'Event not found');
    if (!['published', 'closed'].includes(current.status)) throw fail(409, 'Registration controls are available only for published or closed events');
    checkEvent({ ...current.toObject(), ...req.body });
    const activeFilter = { eventId: current._id, $or: [{ status: { $nin: ['cancelled', 'refund_requested', 'refunded'] } }, { status: 'refund_requested', refundCapacityReserved: true }] };
    const filledSlots = await Registration.countDocuments(activeFilter).session(session);
    const maxSlots = req.body.maxSlots === undefined ? current.maxSlots : req.body.maxSlots;
    if (maxSlots != null && filledSlots > maxSlots) throw fail(409, 'Capacity cannot be lower than existing participant or team reservations');
    event = await Event.findByIdAndUpdate(current._id, { $set: { ...req.body, filledSlots } }, { new: true, runValidators: true, session });
    await audit(req, 'event_registration_controls_updated', event._id, { fields: Object.keys(req.body), previousStatus: current.status, status: event.status }, session);
  });
  return res.json({ success: true, event: { ...event.toObject(), availability: registrationAvailability(event) } });
}

module.exports = { listEvents, getEvent, getPaymentIntent, eventStats, createEvent, updateEvent, listManageEvents, assignEventStaff, unassignEventStaff, eventRegistrations, registrationControls };
