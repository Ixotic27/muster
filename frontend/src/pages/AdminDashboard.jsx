import { useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Users, Ticket, CreditCard, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { PageHead, Field, Notice, Status, Empty, LoadState, useResource, money, date, Refresh, Pagination, idOf } from '../components/common/Portal';
import { OperationsNav, ReviewDialog } from '../components/common/Operations';
import ParticipantAcademicDetails from '../components/common/ParticipantAcademicDetails';
import RefundReview from '../components/common/RefundReview';
import ParticipantRoster from '../components/common/ParticipantRoster';
const sections = {
  overview: 'Overview',
  payments: 'Payments',
  noc: 'NOC review',
  registrations: 'Registrations',
  refunds: 'Refunds',
  users: 'People & access',
  audit: 'Activity log',
  emails: 'Email delivery'
};
const endpoints = {
  overview: '/admin/dashboard',
  payments: '/admin/payments',
  noc: '/noc/admin/pending',
  registrations: '/admin/registrations',
  refunds: '/admin/refunds',
  users: '/admin/users',
  audit: '/admin/audit-logs',
  emails: '/admin/emails'
};
const registrationStatuses = ['pending_team', 'pending_payment', 'payment_submitted', 'pending_noc', 'confirmed', 'checked_in', 'cancelled', 'refund_requested', 'refunded'];
export default function AdminDashboard() {
  const location = useLocation(),
    candidate = location.pathname.split('/')[2],
    tab = sections[candidate] ? candidate : 'overview';
  const [params, setParams] = useSearchParams(),
    [review, setReview] = useState(null),
    [message, setMessage] = useState('');
  const resource = useResource(endpoints[tab] + '?' + params.toString()),
    events = useResource('/events/manage/all');
  const [search, setSearch] = useState(params.get('q') || '');
  const filterable = ['payments', 'noc', 'registrations', 'refunds', 'users'].includes(tab);
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const open = (item, kind) => {
    setMessage('');
    setReview({
      item,
      kind
    });
  };
  const saved = async text => {
    setReview(null);
    setMessage(text);
    await resource.refresh();
  };
  return <div className="portal operations"><OperationsNav /><PageHead kicker="Event operations" title="Administration" action={<Link className="secondary-button" to="/manager">Manage events <ArrowUpRight size={18} /></Link>}>Review participant submissions, manage access and keep event operations moving.</PageHead>
    <nav className="portal-tabs" aria-label="Admin sections">{Object.entries(sections).map(([key, label]) => <NavLink key={key} className={tab === key ? 'selected' : ''} to={'/admin/' + key} onClick={() => {
        setReview(null);
        setMessage('');
        setSearch('');
      }}>{label}</NavLink>)}</nav>
    <Notice success>{message}</Notice>
    <section className="operations-content">
      <div className="section-heading"><div><span className="eyebrow">{tab === 'overview' ? 'Event overview' : 'Operations workspace'}</span><h2>{sections[tab]}</h2></div><Refresh onClick={resource.refresh} /></div>
      {filterable && <form className="operations-filters" onSubmit={e => {
        e.preventDefault();
        setFilter('q', search);
      }}><Field label="Search"><input value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'payments' ? 'Name, reference or UTR' : 'Name, email, student ID or reference'} /></Field>{tab !== 'users' && <Field label="Event"><select value={params.get('eventId') || ''} onChange={e => setFilter('eventId', e.target.value)}><option value="">All events</option>{events.data?.events.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}</select></Field>}{['payments', 'registrations', 'users', 'refunds'].includes(tab) && <Field label={tab === 'users' ? 'Role' : tab === 'registrations' ? 'Registration record status' : 'Status'}><select value={params.get(tab === 'users' ? 'role' : 'status') || (tab === 'refunds' ? 'pending' : '')} onChange={e => setFilter(tab === 'users' ? 'role' : 'status', e.target.value)}><option value="">{['payments', 'refunds'].includes(tab) ? 'Awaiting review' : 'All'}</option>{(tab === 'users' ? ['student', 'organizer', 'admin', 'super_admin'] : tab === 'refunds' ? ['pending', 'completed', 'rejected', 'all'] : tab === 'payments' ? ['submitted', 'verified', 'rejected', 'refunded'] : registrationStatuses).map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></Field>}<button className="secondary-button" type="submit">Search</button></form>}
      <LoadState resource={resource} />
      {!resource.loading && resource.data && <>
        {tab === 'registrations' && <ParticipantRoster key={(params.get('eventId') || '') + ':' + (params.get('q') || '')} endpoint="/admin/roster" eventId={params.get('eventId') || ''} query={params.get('q') || ''} admin onReview={open} />}
        {tab === 'overview' && <><div className="stat-grid operations-stats">{[['users', 'Participants', Users], ['events', 'Published events', Ticket], ['pendingPayments', 'Payments to review', CreditCard], ['pendingNoc', 'NOCs awaiting upload / review', ClipboardCheck], ['confirmed', 'Confirmed registrations', Ticket], ['checkedIn', 'Registrations with entry', ClipboardCheck], ['refundRequests', 'Refund requests', CreditCard]].map(([key, label, Icon]) => <article key={key}><Icon /><strong>{resource.data.stats[key]}</strong><span>{label}</span></article>)}</div><div className="card-grid">{[['payments', 'Review received payments', 'Compare each receipt with your bank transaction before approving.'], ['noc', 'Review uploaded NOCs', 'Approve the signed document before the participant receives their pass.'], ['users', 'Manage your event staff', 'Search accounts, assign checkpoints, and review administrator roles.']].map(([key, title, body]) => <Link className="portal-card operation-shortcut" key={key} to={'/admin/' + key}><h3>{title} <ArrowUpRight size={18} /></h3><p>{body}</p></Link>)}</div></>}
        {tab === 'payments' && <>{!resource.data.payments.length ? <Empty title="No matching payments">New payment proofs will appear here for review.</Empty> : <div className="table-scroll"><table className="portal-table"><thead><tr><th>Participant</th><th>Event / reference</th><th>Payment</th><th>Status</th><th>Review</th></tr></thead><tbody>{resource.data.payments.map(p => <tr key={p._id}><td><strong>{p.payerId?.name || 'Unavailable'}</strong><small>{p.payerId?.email}</small></td><td>{p.eventId?.name}<small>{p.registrationId?.regId}</small></td><td><strong>{money(p.amountInr)}</strong><small>UTR {p.utr}</small></td><td><Status value={p.status} /></td><td><button className="quiet-button" onClick={() => open(p, 'payment')}>Review payment</button></td></tr>)}</tbody></table></div>}</>}
        {['noc', 'refunds', 'registrations'].includes(tab) && <>{!resource.data.registrations.length ? <Empty title="No matching registrations">{tab === 'noc' ? 'Only uploaded documents appear in NOC review. Try another event or search.' : tab === 'refunds' ? 'Refund requests awaiting review will appear here.' : 'Try another event or search, or clear the filters.'}</Empty> : <div className="table-scroll"><table className="portal-table"><thead><tr><th>Participant / team</th><th>Event / reference</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{resource.data.registrations.map(r => <tr key={r._id}><td><strong>{r.leaderId?.name}</strong><small>{r.teamId?.teamName || r.leaderId?.email}</small></td><td>{r.eventId?.name}<small>{r.regId}</small></td><td>{money(r.feeSnapshotInr)}</td><td><Status value={tab === 'refunds' ? r.refundReviewStatus || r.status : r.status} /></td><td><button className="quiet-button" onClick={() => open(r, tab === 'noc' ? 'noc' : tab === 'refunds' ? 'refund' : 'registration')}>{tab === 'noc' ? 'Review NOC' : tab === 'refunds' ? 'Review refund' : 'View registration'}</button></td></tr>)}</tbody></table></div>}</>}
        {tab === 'users' && <>{!resource.data.users.length ? <Empty title="No matching accounts">Search with the participant’s name or email.</Empty> : <div className="table-scroll"><table className="portal-table"><thead><tr><th>Account</th><th>College / ID</th><th>Role</th><th>Access</th></tr></thead><tbody>{resource.data.users.map(u => <tr key={u._id}><td><strong>{u.name}</strong><small>{u.email}</small></td><td>{u.college || '—'}<small>{u.studentId}</small></td><td><Status value={u.role} />{!u.isActive && <small>Inactive account</small>}</td><td><button className="quiet-button" onClick={() => open(u, 'user')}>Manage access</button></td></tr>)}</tbody></table></div>}</>}
        {tab === 'audit' && <>{!resource.data.logs.length ? <Empty title="No activity recorded">Review and staff actions will appear here.</Empty> : <div className="table-scroll"><table className="portal-table"><thead><tr><th>Action</th><th>Performed by</th><th>Target / details</th><th>Time</th></tr></thead><tbody>{resource.data.logs.map(log => <tr key={log._id}><td>{log.action.replaceAll('_', ' ')}</td><td>{log.actorId?.name || 'System'}<small>{log.actorId?.role?.replaceAll('_', ' ')}</small></td><td>{log.targetType}<small className="break-word">{log.details?.reason || log.details?.role || log.targetId}</small></td><td>{date(log.createdAt)}</td></tr>)}</tbody></table><p className="muted">Latest 50 actions</p></div>}</>}
        {tab === 'emails' && <EmailQueue data={resource.data} onReview={open} />}
        <Pagination value={resource.data.pagination} busy={resource.loading} onPage={page => {
          const next = new URLSearchParams(params);
          next.set('page', page);
          setParams(next);
        }} />
      </>}
    </section>
    {review && <AdminReview review={review} events={events.data?.events || []} onClose={() => setReview(null)} onSaved={saved} />}
  </div>;
}
function EmailQueue({
  data,
  onReview
}) {
  const scheduler = data.scheduler;
  const health = scheduler?.health || (data.schedulerConfigured ? 'unavailable' : 'not_configured');
  const healthLabels = {
    recent: 'Worker seen recently',
    running: 'Worker is running',
    not_observed: 'Waiting for the first recorded run',
    stale: 'Last worker run is overdue',
    not_configured: 'Worker access is not configured',
    unavailable: 'Scheduler activity is unavailable'
  };
  const reasons = {
    QUEUE_EMPTY: 'No email is waiting to be sent.',
    GMAIL_CREDENTIALS_MISSING: 'Email credentials are missing. Configure the delivery provider before emails can be sent.',
    SENDER_AUTH_OR_POLICY: 'A sender is paused after an authentication or provider policy error. Resolve the account issue before resuming it.',
    WORKER_BUSY: 'The worker is currently processing the queue.',
    SENDER_COOLDOWN_OR_LIMIT: 'Queued emails are waiting for a sender’s minimum interval or daily limit.',
    WAITING_FOR_SCHEDULER: 'Emails are waiting for the next scheduled worker run.',
    SMTP_RETRY_BACKOFF: 'Delivery will be retried after a temporary email error.',
    EXPIRED_JOBS_AWAITING_CLEANUP: 'Expired messages are waiting for the next worker run to remove them from the active queue.',
    DELIVERED: 'The email provider accepted the messages processed in this run.',
    SMTP_TRANSIENT: 'A temporary email error delayed delivery. The affected messages will be retried.',
    RECIPIENT_REJECTED: 'The email provider rejected a recipient. Review the affected message for details.',
    WORKER_ERROR: 'The last worker run failed. Check the queue errors and scheduler logs.'
  };
  const heartbeat = scheduler?.heartbeat;
  const counts = Object.fromEntries((scheduler?.counts || data.counts || []).map(row => [row._id, row.count]));
  const count = value => Number.isFinite(value) ? value : '—';
  const jobs = data.jobs || [];
  const senders = data.senders || [];
  return <>
    <section className="portal-card" aria-label="Email scheduler status">
      <div className="section-heading"><h3>Email scheduler</h3><span className={`status-pill status-${health}`}>{healthLabels[health] || 'Scheduler status unavailable'}</span></div>
      <p>{scheduler ? reasons[scheduler.reason] || 'Review the queue below for the latest delivery status.' : 'Configuration alone does not confirm a worker run. Refresh this page after the next scheduled run to check its activity.'}</p>
      {health === 'stale' && <Notice>No worker activity has been recorded within {scheduler?.cadence?.staleAfterMinutes || 45} minutes. Check the email automation before relying on queued delivery.</Notice>}
      {health === 'not_configured' && <Notice>The email scheduler is not configured.</Notice>}
      <dl className="summary-list">
        <div><dt>Last completed</dt><dd>{heartbeat?.lastFinishedAt ? date(heartbeat.lastFinishedAt) : 'No completed run recorded'}</dd></div>
        <div><dt>Last started</dt><dd>{heartbeat?.lastStartedAt ? date(heartbeat.lastStartedAt) : 'No run recorded'}</dd></div>
        {heartbeat?.lastResult && <div><dt>Last result</dt><dd>{count(heartbeat.lastResult.sent)} messages accepted by Gmail. {reasons[heartbeat.lastResult.reason] || 'Review the queue for details.'}</dd></div>}
        {scheduler?.nextEligibleAt && <div><dt>Next eligible attempt</dt><dd>{date(scheduler.nextEligibleAt)}</dd></div>}
        {scheduler?.checkedAt && <div><dt>Status checked</dt><dd>{date(scheduler.checkedAt)}</dd></div>}
      </dl>
      {scheduler?.cadence && <p className="muted">Requested schedule: every {scheduler.cadence.requestedMinutes} minutes. Runs are best effort and can be delayed; an eligible attempt time is not a guaranteed delivery time.</p>}
      <div className="stat-grid operations-stats" aria-label="Email queue totals">{[['Ready to send', scheduler?.ready], ['Waiting for retry', scheduler?.backoff], ['Updates to prepare', scheduler?.queuedNotifications], ['Sent', scheduler?.counts || data.counts ? counts.sent || 0 : undefined]].map(([label, value]) => <article key={label}><strong>{count(value)}</strong><span>{label}</span></article>)}</div>
    </section>
    <div className="card-grid">{senders.map(s => <section className="portal-card" key={s.id}>
      <span className={`status-pill status-${s.paused ? 'paused' : s.configured ? 'configured' : 'not_configured'}`}>{s.paused ? 'Paused' : s.configured ? 'Credentials configured' : 'Credentials missing'}</span>
      <h3 className="break-word">{s.email}</h3><p>{s.usedLast24Hours} / {data.settings?.dailyLimit ?? '—'} attempts in 24 hours</p>
      <p className="muted">Minimum spacing: {data.settings?.intervalMs ? data.settings.intervalMs / 1000 : '—'} seconds</p>
      {s.nextAvailableAt && new Date(s.nextAvailableAt).getTime() > Date.now() && <p className="muted">Sender eligible after {date(s.nextAvailableAt)}</p>}
      {s.paused && <><Notice>{s.lastError || 'Resolve the sender account issue before resuming.'}</Notice><button className="secondary-button" onClick={() => onReview(s, 'sender')}>Resume sender</button></>}
    </section>)}</div>
    <p className="muted">“Sent” means Gmail accepted the message. Inbox placement and delivery time can vary.</p>
    {!jobs.length ? <Empty title="No email jobs">{scheduler?.queuedNotifications ? 'Account updates are waiting to be prepared by the next worker run.' : 'Invitations and registration updates will appear here.'}</Empty> : <div className="table-scroll"><table className="portal-table"><thead><tr><th>Recipient / subject</th><th>Status</th><th>Attempts</th><th>Action</th></tr></thead><tbody>{jobs.map(j => <tr key={j._id}><td className="break-word">{j.to}<small>{j.subject}</small></td><td><Status value={j.status} /><small>{j.lastError}</small>{j.status === 'queued' && j.availableAt && new Date(j.availableAt).getTime() > Date.now() && <small>Retry eligible after {date(j.availableAt)}</small>}</td><td>{j.attempts}</td><td>{j.status === 'failed' && <button className="quiet-button" onClick={() => onReview(j, 'email')}>Retry email</button>}</td></tr>)}</tbody></table><p className="muted">Latest 100 messages</p></div>}
  </>;
}
function AdminReview({
  review: {
    item,
    kind
  },
  events,
  onClose,
  onSaved
}) {
  const {
      user
    } = useAuth(),
    detail = useResource(kind === 'registration' ? '/admin/registrations/' + item._id : null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [role, setRole] = useState(item.role || 'student'),
    [eventId, setEventId] = useState('');
  async function act(path, body, message, method = 'POST') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(path, {
        method,
        body
      });
      await onSaved(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const r = detail.data?.registration || item;
  return <ReviewDialog title={{
    payment: 'Review payment',
    noc: 'Review NOC',
    refund: 'Review refund',
    registration: 'Registration details',
    user: 'Manage account access',
    sender: 'Resume email sender',
    email: 'Retry email'
  }[kind]} busy={busy} onClose={onClose}><Notice>{error}</Notice>
    {['payment', 'noc'].includes(kind) && <><h3>{item.payerId?.name || item.leaderId?.name}</h3><p>{item.eventId?.name} · {item.registrationId?.regId || item.regId}</p></>}
    {kind === 'payment' && <><dl className="summary-list"><div><dt>Amount</dt><dd>{money(item.amountInr)}</dd></div><div><dt>UTR</dt><dd>{item.utr}</dd></div><div><dt>Submitted</dt><dd>{date(item.createdAt)}</dd></div><div><dt>Status</dt><dd><Status value={item.status} /></dd></div></dl>{item.screenshotUrl ? <><a className="text-link" href={item.screenshotUrl} target="_blank" rel="noreferrer">Open original payment proof</a><img className="admin-proof" src={item.screenshotUrl} alt="Submitted payment receipt" /></> : <Notice>Payment proof is unavailable. Ask for a new submission.</Notice>}{item.status === 'submitted' && <><label className="check-field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I matched the recipient, exact amount and UTR against the actual received bank transaction.</label><button className="primary-button" disabled={busy || !confirmed || !item.screenshotUrl} onClick={() => act('/admin/payments/' + item._id + '/verify', null, 'Payment verified. Eligible entry passes are issued automatically.')}>{busy ? 'Saving…' : 'Verify payment'}</button></>}{item.rejectionReason && <Notice>{item.rejectionReason}</Notice>}</>}
    {kind === 'noc' && <><a className="secondary-button" href={item.nocDocumentUrl} target="_blank" rel="noreferrer">Open signed NOC</a><p className="muted">Submitted {date(item.nocSubmittedAt)}</p><label className="check-field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed the signature and matched the participant details.</label><button className="primary-button" disabled={busy || !confirmed} onClick={() => act('/noc/admin/' + item._id + '/verify', null, 'NOC approved. Entry passes have been issued.')}>Approve NOC</button></>}
    {kind === 'refund' && <RefundReview item={item} endpoint="/admin/refunds" onSaved={onSaved} onBusyChange={setBusy} />}
    {(['noc'].includes(kind) || kind === 'payment' && item.status === 'submitted') && <form className="portal-form rejection-form" onSubmit={e => {
      e.preventDefault();
      act(kind === 'noc' ? '/noc/admin/' + item._id + '/reject' : '/admin/' + (kind === 'payment' ? 'payments' : 'refunds') + '/' + item._id + '/reject', {
        reason
      }, 'Review saved. The participant can see your explanation.');
    }}><Field label="Reason for rejection" value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={500} required hint="Give a clear reason and explain what the participant should do next." /><button className="secondary-button" disabled={busy}>Reject with reason</button></form>}
    {kind === 'registration' && <><LoadState resource={detail} /><dl className="summary-list">{[['Reference', r.regId], ['Participant', r.leaderId?.name], ['Email', r.leaderId?.email], ['Team', r.teamId?.teamName || 'Solo'], ['Event', r.eventId?.name], ['Status', r.status?.replaceAll('_', ' ')], ['Payment', r.paymentId?.status || 'Not submitted'], ['NOC', r.nocStatus?.replaceAll('_', ' ')]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl><h3>Participant academic details</h3><ParticipantAcademicDetails participant={r.leaderId} />{r.teamId?.members?.length > 0 && <><h3>Accepted team members</h3><ul>{r.teamId.members.filter(m => m.status === 'accepted').map((m, i) => <li key={idOf(m.userId) || m._id || i}><strong>{m.userId?.name || m.nameSnapshot || m.emailSnapshot || m.studentIdSnapshot || 'Participant'}</strong> · {m.status}<small>{m.userId?.email || m.emailSnapshot}</small><ParticipantAcademicDetails participant={m.userId} snapshot={m} /></li>)}</ul></>}<h3>Entry passes</h3>{detail.data && !detail.data.passes.length && <p>No passes have been issued yet.</p>}{detail.data?.passes.map(p => <div className="pass-admin-row" key={p._id}><strong>{p.userId?.name}</strong><small>{p.passId}</small><Status value={p.status === 'revoked' ? 'revoked' : p.checkInStatus} />{p.status === 'issued' && <form onSubmit={e => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          act('/passes/' + p._id + '/revoke', {
            reason: form.get('reason')
          }, 'This attendee’s pass has been revoked. Other team passes remain valid.');
        }}><Field label={'Reason to revoke ' + (p.userId?.name || 'pass')} name="reason" required minLength={3} maxLength={500} /><button className="quiet-button" disabled={busy}>Revoke this pass</button></form>}</div>)}</>}
    {kind === 'user' && <><h3>{item.name}</h3><p>{item.email}</p><Status value={item.role} /><h3>Participant academic details</h3><ParticipantAcademicDetails participant={item} />{user.role === 'super_admin' ? <form className="portal-form" onSubmit={e => {
        e.preventDefault();
        act('/admin/users/' + item._id + '/role', {
          role
        }, 'Account role updated.', 'PATCH');
      }}><Field label="Account role"><select value={role} disabled={item._id === user._id || !item.isActive} onChange={e => setRole(e.target.value)}>{['student', 'organizer', 'admin', 'super_admin'].map(x => <option key={x} value={x}>{x.replaceAll('_', ' ')}</option>)}</select></Field><p className="muted">Super admins can change staff roles. Your own role cannot be changed here.</p><button className="secondary-button" disabled={busy || item._id === user._id || role === item.role || !item.isActive}>Save role</button></form> : <p className="muted">Only a super admin can change account roles.</p>}<h3>Assigned events</h3>{(item.assignedEvents || []).length ? item.assignedEvents.map(id => <div className="list-row" key={id}><span>{events.find(e => e._id === id)?.name || id}</span><button className="quiet-button" disabled={busy} onClick={() => act('/events/' + id + '/unassign', {
          userId: item._id
        }, 'Event assignment removed.')}>Remove assignment</button></div>) : <p>No event assignments.</p>}<form className="portal-form rejection-form" onSubmit={e => {
        e.preventDefault();
        act('/events/' + eventId + '/assign', {
          userId: item._id
        }, 'Event manager and scanner access assigned.');
      }}><Field label="Assign event"><select value={eventId} required disabled={!item.isActive} onChange={e => setEventId(e.target.value)}><option value="">Choose an event</option>{events.filter(e => !(item.assignedEvents || []).includes(e._id)).map(e => <option key={e._id} value={e._id}>{e.name}</option>)}</select></Field><p className="muted">An assigned participant becomes an organizer with access to this event’s roster and entry scanner.</p><button className="primary-button" disabled={busy || !eventId || !item.isActive}>Assign event</button></form></>}
    {['sender', 'email'].includes(kind) && <><p>{kind === 'sender' ? 'Resume this sender after resolving its Gmail account issue.' : 'Queue this failed message for another delivery attempt. Expired messages cannot be retried.'}</p><p className="break-word">{item.email || item.subject}</p><button className="primary-button" disabled={busy} onClick={() => act(kind === 'sender' ? '/admin/email-senders/' + item.id + '/resume' : '/admin/emails/' + item._id + '/retry', null, kind === 'sender' ? 'Sender resumed.' : 'Email queued for retry.')}>{kind === 'sender' ? 'Issue resolved — resume' : 'Retry delivery'}</button></>}
  </ReviewDialog>;
}
