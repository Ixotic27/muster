const crypto=require('crypto');
const EmailJob=require('../models/EmailJob');
const brand=()=>process.env.BRAND_NAME||'EventFlow';
function absoluteLink(path='/dashboard'){
 const origin=process.env.FRONTEND_URL||process.env.APP_URL||(process.env.NODE_ENV!=='production'?'http://localhost:3000':'');
 if(!origin)throw new Error('FRONTEND_URL is required for production email');
 const base=new URL(origin),url=new URL(path,base);
 if(!['http:','https:'].includes(base.protocol)||url.origin!==base.origin||(process.env.NODE_ENV==='production'&&(base.protocol!=='https:'||['localhost','127.0.0.1'].includes(base.hostname))))throw new Error('Email links must use the configured application origin');
 return url.toString();
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function normalizeBody(value){return String(value||'').replace(/\\n/g,'\n').replace(/\r\n/g,'\n').trim();}
function formatDate(value){return value?new Date(value).toLocaleString('en-GB',{timeZone:process.env.EVENT_TIMEZONE||'UTC',dateStyle:'medium',timeStyle:'short'})+' '+(process.env.EVENT_TIMEZONE||'UTC'):'';}
const purposes={account_created:'You signed up for an event account.',password_reset:'A password reset was requested for the account using this email address.',password_changed:'Your account password was successfully changed.',team_invite:'A team leader invited this email address to join their event team.',team_invite_accepted:'A participant accepted your team invitation.',team_invite_rejected:'A participant declined your team invitation.',registration_created:'An event registration was created for you or your team.',registration_cancelled:'Your unpaid registration was withdrawn.',payment_review_required:'An additional captured payment requires reconciliation for an event you manage.',payment_verified:'Payment for your event registration was successfully verified.',payment_submitted:'Your payment proof has been received for review.',payment_rejected:'Your payment proof needs attention.',pass_generated:'Your registration is approved and your personal event entry pass is ready.',pass_issued:'Your approved personal entry pass is ready.',event_reminder:'Your confirmed event is coming up within 24 hours.',refund_requested:'Your withdrawal and refund request was received.',refund_approved:'The organizers recorded a completed refund.',refund_rejected:'Your refund request was reviewed.',team_deleted:'Your team was closed by its leader or following withdrawal.',refund_review_requested:'A participant requested a refund for an event you manage.',registration_staff_notice:'A team registered for an event you manage.',registration_closed_staff_notice:'A registration for an event you manage was closed.',noc_verified:'Your required document was approved.',noc_rejected:'Your required document needs attention.'};
function nextStep(kind){
 if(kind==='password_reset')return 'Choose a new password using the secure link within 30 minutes. If you did not request this, ignore this email; your password remains unchanged.';
 if(kind==='team_invite')return 'Sign up or sign in using the email address that received this invitation, then explicitly accept or decline. Joining a team does not complete registration or payment.';
 if(['pass_generated','pass_issued','event_reminder'].includes(kind))return 'Save your personal QR, check the event time and venue, and present it at the correct checkpoint. Keep the QR private.';
 if(kind==='refund_approved')return 'Check your bank account and registration for the recorded transfer details.';
 if(kind==='payment_verified')return 'Open your registration to view the receipt and any remaining document requirements. Your pass is issued after all requirements are satisfied.';
 return 'Open your account to review the current status and any remaining actions.';
}
// Persist before returning to the caller. SMTP runs after transaction commit,
// through the same protected worker used by the scheduler.
async function sendEmail({ dedupeKey = crypto.randomUUID(), to, subject, text, link, kind, expiresAt, inviteId, passId, notificationId, registrationId, eventId, teamId, recipientId, audience, staffActivationUserId, staffActivationVersion, staffDisplayName, reminderDeadline, reminderCheckpoint, reminderCheckpointEndsAt, reminderFormationDeadline, reminderPaymentDeadline, priority = 0 }, { session } = {}) {
  const job = await EmailJob.findOneAndUpdate({ dedupeKey }, { $setOnInsert: {
    dedupeKey, to, subject, text, ...(link ? { link: absoluteLink(link) } : {}), kind,
    expiresAt: expiresAt || new Date(Date.now() + 7 * 86400000), inviteId, passId, notificationId, registrationId, eventId, teamId, recipientId, audience, staffActivationUserId, staffActivationVersion, staffDisplayName, reminderDeadline, reminderCheckpoint, reminderCheckpointEndsAt, reminderFormationDeadline, reminderPaymentDeadline, priority
  } }, { upsert: true, new: true, setDefaultsOnInsert: true, session });
  require('./email-request-context.service').trackEmailJob(dedupeKey);
  return job;
}
const staffLifecycleKinds = new Set(['refund_review_requested', 'registration_staff_notice', 'registration_closed_staff_notice', 'payment_review_required']);
const participantLifecycleKinds = new Set(['registration_created','registration_cancelled','refund_requested','refund_approved','refund_rejected','team_deleted','payment_verified','payment_submitted','payment_rejected','noc_verified','noc_rejected']);
// Notification recipients are durable identifiers, but access is checked again
// immediately before SMTP. A role change must not leak a later refund notice.
async function lifecycleDetails(job) {
  const scoped = job.audience || staffLifecycleKinds.has(job.kind) || (participantLifecycleKinds.has(job.kind) && (job.registrationId || job.teamId));
  if (!scoped) return [];
  const { User, Registration, Event, Team } = require('../models');
  const recipient = await User.findOne(job.recipientId ? { _id: job.recipientId, email: job.to, isActive: true } : { email: job.to, isActive: true }).select('_id name role assignedEvents').lean();
  if (!recipient) return null;
  const registration = job.registrationId ? await Registration.findById(job.registrationId).lean() : null;
  if (job.registrationId && !registration) return null;
  const eventId = registration?.eventId || job.eventId;
  if (job.eventId && eventId && String(job.eventId) !== String(eventId)) return null;
  const event = eventId ? await Event.findById(eventId).select('name').lean() : null;
  if (!event) return null;
  const teamId = registration?.teamId || job.teamId;
  if (job.teamId && teamId && String(job.teamId) !== String(teamId)) return null;
  const team = teamId ? await Team.findById(teamId).select('teamName eventId leaderId members closedRoster status').lean() : null;
  if (teamId && (!team || String(team.eventId) !== String(event._id))) return null;
  if (job.audience === 'staff') {
    const authorized = ['admin', 'super_admin'].includes(recipient.role) || (recipient.role === 'organizer' && (recipient.assignedEvents || []).some(id => String(id) === String(event._id)));
    if (!authorized || !staffLifecycleKinds.has(job.kind) || !registration) return null;
    if (job.kind === 'refund_review_requested' && (registration.status !== 'refund_requested' || (registration.refundReviewStatus && registration.refundReviewStatus !== 'pending'))) return null;
  } else {
    if (staffLifecycleKinds.has(job.kind) || !participantLifecycleKinds.has(job.kind)) return null;
    const owner = registration && String(registration.leaderId) === String(recipient._id);
    const roster = team?.status === 'cancelled' ? team.closedRoster || team.members : team?.members;
    const accepted = (roster || []).some(member => member.status === 'accepted' && String(member.userId) === String(recipient._id));
    if (!owner && !accepted) return null;
    if (job.kind === 'refund_requested' && registration?.status !== 'refund_requested') return null;
    if (job.kind === 'refund_approved' && (registration?.status !== 'refunded' || registration.refundReviewStatus !== 'completed' || !registration.refundReference || !registration.refundedAt)) return null;
    if (job.kind === 'refund_rejected' && (registration?.status !== 'cancelled' || registration.refundReviewStatus !== 'rejected')) return null;
    if (job.kind === 'team_deleted' && team?.status !== 'cancelled') return null;
  }
  const details = [['Event', event.name], ['Team', team?.teamName], ['Registration', registration?.regId], ['Registration status', registration?.status]].filter(([, value]) => value);
  if (job.kind === 'refund_approved' || (job.kind === 'registration_closed_staff_notice' && registration?.refundReviewStatus === 'completed')) {
    details.push(['Refund amount', '₹' + registration.refundAmountInr], ['Transfer reference', registration.refundReference], ['Refund recorded', formatDate(registration.refundedAt)]);
  }
  if (team?.status === 'cancelled') details.push(['Team status', 'Deleted / closed']);
  return details;
}

async function renderEmail(job){
 if(['staff_temporary_password','staff_activation'].includes(job.kind))return null;
 const details=await lifecycleDetails(job);if(details===null)return null;
 let attachments=[],image='';
 if(job.recipientId){const recipient=await require('../models/User').findOne({_id:job.recipientId,email:job.to,isActive:true}).select('_id').lean();if(!recipient)return null;}
 if(job.kind==='password_reset'){
  const user=await require('../models/User').findOne({_id:job.recipientId,email:job.to,isActive:true}).select('+passwordResetTokenHash passwordResetExpiresAt').lean();
  const token=new URLSearchParams(new URL(absoluteLink(job.link)).hash.slice(1)).get('token')||'';
  if(!user||!/^[a-f0-9]{64}$/.test(token)||user.passwordResetExpiresAt<=new Date()||user.passwordResetTokenHash!==crypto.createHash('sha256').update(token).digest('hex')||job.dedupeKey!=='reset:'+user.passwordResetTokenHash)return null;
 }
 if(job.inviteId){
  const invite=await require('../models/TeamInvite').findById(job.inviteId).select('+tokenHash').populate('teamId','teamName status members').populate('eventId','name eventDate status registrationDeadline maxTeamSize').populate('invitedBy','name').lean();
  if(!invite||invite.status!=='pending'||invite.expiresAt<=new Date()||invite.teamId?.status!=='forming'||!require('../utils/eventAvailability').registrationIsOpen(invite.eventId)||invite.invitedEmail!==job.to)return null;
  if(invite.requiresToken){const token=new URLSearchParams(new URL(absoluteLink(job.link)).hash.slice(1)).get('token')||'';if(crypto.createHash('sha256').update(token).digest('hex')!==invite.tokenHash)return null;}
  details.push(['Invited by',invite.invitedBy?.name],['Team',invite.teamId.teamName],['Event',invite.eventId.name],['Respond before',formatDate(invite.expiresAt)]);
 }
 if(job.passId){
  const pass=await require('../models/Pass').findById(job.passId).select('+qrDataUrl').populate('userId','name email isActive').populate('eventId','name eventDate venue status').populate({path:'registrationId',select:'regId status teamId',populate:{path:'teamId',select:'teamName'}}).lean();
  if(!pass||pass.status!=='issued'||pass.expiresAt<=new Date()||!pass.userId?.isActive||pass.userId.email!==job.to||!['published','closed'].includes(pass.eventId?.status)||!['confirmed','checked_in'].includes(pass.registrationId?.status))return null;
  if(job.kind==='event_reminder'&&pass.eventId.eventDate<=new Date())return null;
  details.push(['Attendee',pass.userId.name],['Event',pass.eventId.name],['Date & time',formatDate(pass.eventId.eventDate)],['Venue',pass.eventId.venue],['Team',pass.registrationId.teamId?.teamName||'Individual'],['Registration',pass.registrationId.regId],['Personal pass',pass.passId]);
  const png=pass.qrDataUrl?.split(',')[1];if(!png)throw new Error('PASS_QR_MISSING');
  attachments=[{filename:pass.passId+'.png',content:Buffer.from(png,'base64'),contentType:'image/png',cid:'entry-qr'}];
  image='<p style="text-align:center"><img src="cid:entry-qr" alt="Your private event entry QR" width="240" style="width:240px;max-width:100%;height:auto" /></p>';
 }
 const purpose=purposes[job.kind]||'An action linked to this email address produced an account or event update.';
 const link=job.link?absoluteLink(job.link):'',text=normalizeBody(job.text),step=nextStep(job.kind),footer='Keep your password and entry QR private. This message does not ask you to share a password or payment PIN.';
 const rows=details.filter(([,v])=>v!==undefined&&v!==null&&v!=='');
 const htmlRows=rows.map(([k,v])=>'<tr><th align="left" style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:400;width:36%">'+escapeHtml(k)+'</th><td style="padding:10px;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere">'+escapeHtml(v)+'</td></tr>').join('');
 const body=text.split(/\n{2,}/).map(p=>'<p style="line-height:1.7">'+escapeHtml(p).replace(/\n/g,'<br>')+'</p>').join('');
 return {to:job.to,subject:job.subject,attachments,
 text:[brand(),job.subject,'Why you received this email: '+purpose,rows.map(([k,v])=>k+': '+v).join('\n'),text,step,link,footer].filter(Boolean).join('\n\n'),
 html:'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef2f6;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:white;border-radius:16px;overflow:hidden"><tr><td style="background:#123a5f;color:white;padding:28px;font-size:24px;font-weight:700">'+escapeHtml(brand())+'</td></tr><tr><td style="padding:28px"><h1 style="font-size:25px;line-height:1.3">'+escapeHtml(job.subject)+'</h1><p style="background:#eff6ff;padding:16px;line-height:1.6"><strong>Why are you receiving this email?</strong><br>'+escapeHtml(purpose)+'</p><table width="100%" style="border-collapse:collapse;font-size:14px">'+htmlRows+'</table>'+body+image+'<h2 style="font-size:17px">What happens next</h2><p style="line-height:1.7">'+escapeHtml(step)+'</p>'+(link?'<p><a href="'+escapeHtml(link)+'" style="display:inline-block;background:#125f9b;color:white;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:700">Open your account</a></p><p style="font-size:12px;word-break:break-all"><a href="'+escapeHtml(link)+'">'+escapeHtml(link)+'</a></p>':'')+'<p style="border-top:1px solid #e2e8f0;padding-top:20px;color:#64748b;font-size:12px;line-height:1.6">'+escapeHtml(footer)+'<br>Sent to '+escapeHtml(job.to)+' because of an action linked to this email address.'+(process.env.SUPPORT_EMAIL?'<br>Support: '+escapeHtml(process.env.SUPPORT_EMAIL):'')+'</p></td></tr></table></td></tr></table></body></html>'};
}
const emailLifetimeFilter=(now=new Date())=>({expiresAt:{$gt:now}});
module.exports={sendEmail,absoluteLink,renderEmail,escapeHtml,emailLifetimeFilter,formatDate};
