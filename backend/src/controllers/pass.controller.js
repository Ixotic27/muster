const { Pass, Registration, AdminAction, Event } = require('../models');
const { certificateRecipientFields } = require('../utils/academicProfile');

async function withPersonalTeam(pass) { return pass; }

async function listMyPasses(req, res) {
  const passes = await Pass.find({ userId: req.user._id, status: 'issued' }).select('+token +qrDataUrl').populate('eventId', 'name slug eventDate venue registrationMode teamFormationDeadline').populate('registrationId', 'regId status billingMode').sort({ createdAt: -1 }).lean();
  await Promise.all(passes.map(withPersonalTeam));
  return res.json({ success: true, passes });
}

async function getPass(req, res) {
  const pass = await Pass.findById(req.params.id).select('+token +qrDataUrl').populate('eventId', 'name slug eventDate venue registrationMode teamFormationDeadline').populate('registrationId', 'regId status billingMode').populate('userId', certificateRecipientFields).lean();
  if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });
  if (String(pass.userId?._id || pass.userId) !== String(req.user._id) && !['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only the pass owner or an administrator can open this QR' });
  await withPersonalTeam(pass);
  return res.json({ success: true, pass });
}

async function revokePass(req, res) {
  let pass;
  await require('mongoose').connection.transaction(async session => {
    const current = await Pass.findOne({ _id: req.params.id, status: 'issued' }).session(session);
    if (!current) throw Object.assign(new Error('Issued pass not found'), { statusCode: 404 });
    const registration = await Registration.findById(current.registrationId).session(session);
    pass = await Pass.findOneAndUpdate({ _id: current._id, status: 'issued' }, { $set: { status: 'revoked' } }, { new: true, session }).lean();
    await AdminAction.create([{ actorId: req.user._id, action: 'pass_revoked', targetType: 'pass', targetId: pass._id, details: { reason: String(req.body.reason || 'Revoked by administrator') }, requestId: req.id }], { session });
  });
  return res.json({ success: true, pass });
}

module.exports = { listMyPasses, getPass, revokePass };
