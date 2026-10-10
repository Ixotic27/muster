import { useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, MapPin, Users, ScanLine, Plus, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { eventFormPayload } from '../utils/eventPresentation';
import { OperationsNav, ReviewDialog } from '../components/common/Operations';
import ParticipantAcademicDetails from '../components/common/ParticipantAcademicDetails';
import ParticipantRoster from '../components/common/ParticipantRoster';
import RefundQueue from '../components/common/RefundQueue';
import RegistrationControls from '../components/common/RegistrationControls';
import { PageHead, Field, Notice, Status, Empty, LoadState, useResource, money, date, Refresh, Pagination } from '../components/common/Portal';
const states = ['draft', 'published', 'closed', 'cancelled'];
export default function EventManager() {
  const {
      user
    } = useAuth(),
    admin = ['admin', 'super_admin'].includes(user.role),
    resource = useResource('/events/manage/all');
  const [params, setParams] = useSearchParams(),
    eventId = params.get('event') || '';
  const [editor, setEditor] = useState(null),
    [message, setMessage] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('');
  const chosen = resource.data?.events.find(e => e._id === eventId);
  const visible = (resource.data?.events || []).filter(e => (!status || e.status === status) && (e.name + ' ' + e.venue).toLowerCase().includes(search.toLowerCase()));
  const choose = id => {
    setParams(id ? {
      event: id
    } : {});
    setMessage('');
  };
  return <div className="portal operations"><OperationsNav /><PageHead kicker={admin ? 'Event management' : 'Your assigned events'} title="Event manager" action={admin && <button className="primary-button" onClick={() => setEditor({})}><Plus size={18} />Create event</button>}>{admin ? 'Manage events, registration rules and staff. Open an event to review its participant roster.' : 'View your assigned events, check participant readiness and open the matching entry checkpoint.'}</PageHead><Notice success>{message}</Notice><LoadState resource={resource} />
    <div className="manager-layout"><aside className="manager-events"><div className="section-heading"><h2>{admin ? 'All events' : 'Assigned events'}</h2><Refresh onClick={resource.refresh} /></div><Field label="Find an event" value={search} onChange={e => setSearch(e.target.value)} placeholder="Event name or venue" /><Field label="Event status"><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{states.map(s => <option key={s}>{s}</option>)}</select></Field>{!resource.loading && !visible.length && <Empty title="No events found">{admin ? 'Change your filters or create a new event.' : 'Ask an administrator to assign an event to your account.'}</Empty>}<div className="event-selector">{visible.map(e => <button key={e._id} className={'event-choice ' + (e._id === eventId ? 'selected' : '')} onClick={() => choose(e._id)} aria-pressed={e._id === eventId}><Status value={e.status} /><strong>{e.name}</strong><span><MapPin size={14} />{e.venue}</span><small>{date(e.eventDate)}</small></button>)}</div></aside>
    <main className="manager-detail">{chosen ? <><section className="portal-card event-overview"><div className="section-heading"><Status value={chosen.status} />{admin && <button className="quiet-button" onClick={() => setEditor(chosen)}><Pencil size={16} />Edit event</button>}</div><h2>{chosen.name}</h2><p>{chosen.description || 'No description added yet.'}</p><div className="event-meta"><span><CalendarDays size={17} />{date(chosen.eventDate)}</span><span><MapPin size={17} />{chosen.venue}</span><span><Users size={17} />{chosen.participationType === 'solo' ? 'Solo entry' : chosen.minTeamSize + '–' + chosen.maxTeamSize + ' people per team'}</span></div><dl className="summary-list"><div><dt>Entry fee</dt><dd>{money(chosen.feeInr)}{''}</dd></div><div><dt>Deadline</dt><dd>{chosen.registrationDeadline ? date(chosen.registrationDeadline) : 'Open until event starts'}</dd></div><div><dt>Capacity</dt><dd>{<>{chosen.filledSlots || 0} / {chosen.maxSlots || 'Unlimited'} registrations</>}</dd></div><div><dt>NOC</dt><dd>{chosen.requiresNOC ? 'Required before entry pass' : 'Not required'}</dd></div></dl><div className="button-row">{['published', 'closed'].includes(chosen.status) && <Link className="primary-button" to={'/scanner?event=' + chosen._id}><ScanLine size={18} />Open checkpoint</Link>}{['published', 'closed'].includes(chosen.status) && <Link className="text-link" to={'/events/' + chosen.slug}>View public event</Link>}</div></section><RefundQueue key={"refunds-" + chosen._id} event={chosen} /><RegistrationControls key={"controls-" + chosen._id} event={chosen} onSaved={resource.refresh} /><section className="operations-content"><ParticipantRoster key={"participants-" + chosen._id} endpoint={"/events/manage/" + chosen._id + "/roster"} admin={admin} /></section><details className="portal-card"><summary>Registration records & assigned staff</summary><EventRoster key={chosen._id} event={chosen} admin={admin} /></details></> : <Empty title={eventId ? 'Event unavailable' : 'Choose an event'}>{eventId ? 'This event may have been removed or your assignment may have changed.' : 'Select an event to see its registrations, staff and entry totals.'}</Empty>}</main></div>
    {editor && <EventEditor event={editor} onClose={() => setEditor(null)} onSaved={async e => {
      setEditor(null);
      await resource.refresh();
      setParams({
        event: e._id
      });
      setMessage('Event saved successfully.');
    }} />}
  </div>;
}
function EventRoster({
  event,
  admin
}) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('');
  const resource = useResource('/events/manage/' + event._id + '/registrations?' + new URLSearchParams({
    page,
    q: query,
    status
  }));
  return <section className="operations-content"><div className="section-heading"><h2>Participants & entry</h2><Refresh onClick={resource.refresh} /></div><LoadState resource={resource} />{resource.data && <><div className="stat-grid checkpoint-stats"><article><strong>{resource.data.pagination.total}</strong><span>Matching registrations</span></article><article><strong>{resource.data.stats.total}</strong><span>Issued entry passes</span></article><article><strong>{resource.data.stats.checkedIn}</strong><span>Attendees checked in</span></article></div><details className="staff-list"><summary>Assigned staff ({resource.data.staff.length})</summary>{resource.data.staff.length ? resource.data.staff.map(s => <p key={s._id}><strong>{s.name}</strong> · {s.email}</p>) : <p>No organizers assigned yet.</p>}{admin && <Link className="text-link" to="/admin/users">Assign staff in People & access</Link>}</details></>}
    <form className="operations-filters" onSubmit={e => {
      e.preventDefault();
      setPage(1);
      setQuery(search);
    }}><Field label="Find a participant" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email, team or registration" /><Field label="Registration status"><select value={status} onChange={e => {
          setPage(1);
          setStatus(e.target.value);
        }}><option value="">All statuses</option>{['pending_team', 'pending_payment', 'payment_submitted', 'pending_noc', 'confirmed', 'checked_in', 'cancelled', 'refund_requested', 'refunded'].map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></Field><button className="secondary-button">Search roster</button></form>
    {!resource.loading && resource.data && <>{!resource.data.registrations.length ? <Empty title="No matching participants">New registrations will appear here. Try clearing the filters.</Empty> : <div className="roster-list">{resource.data.registrations.map(r => <article className="roster-row" key={r._id}><div><strong>{r.teamId?.teamName || r.leaderId?.name}</strong><small>{r.regId}</small><p>{r.leaderId?.name} · {r.leaderId?.email}</p><details><summary>{'Leader academic details'}</summary><ParticipantAcademicDetails participant={r.leaderId} /></details>{r.teamId?.members?.length > 0 && <details><summary>{r.teamId.members.filter(m => m.status === 'accepted').length} accepted team members</summary><ul>{r.teamId.members.filter(m => m.status === 'accepted').map((m, i) => <li key={i}><strong>{m.userId?.name || m.nameSnapshot || m.emailSnapshot || m.studentIdSnapshot || 'Participant'}</strong> · {m.status}<small>{m.userId?.email || m.emailSnapshot}</small><ParticipantAcademicDetails participant={m.userId} snapshot={m} /></li>)}</ul></details>}</div><div><Status value={r.status} /><small>NOC: {(r.nocStatus || 'not_required').replaceAll('_', ' ')}</small>{admin && <Link className="text-link" to={'/admin/registrations?q=' + encodeURIComponent(r.regId)}>Review registration</Link>}</div></article>)}</div>}<Pagination value={resource.data.pagination} onPage={setPage} busy={resource.loading} /></>}
  </section>;
}
function EventEditor({
  event,
  onClose,
  onSaved
}) {
  const localDate = value => {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const [form, setForm] = useState({
    name: event.name || '',
    slug: event.slug || '',
    description: event.description || '',
    category: event.category || 'technical',
    participationType: event.participationType || 'solo',
    minTeamSize: event.minTeamSize || 1,
    maxTeamSize: event.maxTeamSize || 1,
    feeInr: event.feeInr ?? 0,
    prizePool: event.prizePool || '',
    bannerImage: event.bannerImage || '',
    eventDate: localDate(event.eventDate),
    registrationDeadline: localDate(event.registrationDeadline),
    ...{},
    venue: event.venue || '',
    maxSlots: event.maxSlots || '',
    requiresNOC: !!event.requiresNOC,
    status: event.status || 'draft',
    rules: (event.rules || []).join('\n')
  });
  const initial = useRef(form);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmCancel, setConfirmCancel] = useState(false);
  const update = (key, value) => setForm(old => ({
    ...old,
    [key]: value,
    ...(key === 'participationType' && value === 'solo' ? {
      minTeamSize: 1,
      maxTeamSize: 1
    } : {})
  }));
  const input = (key, label, props = {}) => <Field label={label} value={form[key]} onChange={e => update(key, e.target.value)} {...props} />;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = eventFormPayload(form, event, initial.current);
      if (event._id && !Object.keys(payload).length) {
        onClose();
        return;
      }
      const result = await api('/events' + (event._id ? '/' + event._id : ''), {
        method: event._id ? 'PATCH' : 'POST',
        body: payload
      });
      await onSaved(result.event);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <ReviewDialog title={event._id ? 'Edit event' : 'Create event'} busy={busy} onClose={onClose}><Notice>{error}</Notice><form className="portal-form" onSubmit={submit}><div className="form-grid">{input('name', 'Event name', {
          required: true,
          maxLength: 120
        })}{input('slug', 'URL slug', {
          required: true,
          pattern: '[a-z0-9-]+',
          hint: 'Lowercase letters, numbers and hyphens.'
        })}{input('bannerImage', 'Event image URL (optional)', { type: 'url', placeholder: 'https://example.com/event.webp', hint: 'Use an image URL you own or have permission to publish.' })}<Field label="Category"><select value={form.category} onChange={e => update('category', e.target.value)}><option value="technical">Technology</option><option value="non_technical">Community & sport</option><option value="esports">Gaming</option></select></Field><Field label="Event status"><select value={form.status} onChange={e => update('status', e.target.value)}>{states.map(s => <option key={s}>{s}</option>)}</select></Field>{input('eventDate', 'Event date & time (your device time)', {
          type: 'datetime-local',
          required: true
        })}{input('registrationDeadline', 'Registration deadline (your device time)', {
          type: 'datetime-local'
        })}{input('venue', 'Venue', {
          required: true,
          maxLength: 200
        })}{input('maxSlots', 'Registration capacity', {
          type: 'number',
          min: 1,
          hint: 'Leave blank for unlimited registrations.'
        })}{input('feeInr', 'Entry fee (INR)', {
          type: 'number',
          min: 0,
          step: '0.01',
          required: true
        })}{input('prizePool', 'Prize pool', {
          maxLength: 120
        })}<Field label="Participation"><select value={form.participationType} onChange={e => update('participationType', e.target.value)}><option value="solo">Solo</option><option value="team">Team</option><option value="both">Solo or team</option></select></Field><label className="check-field"><input type="checkbox" checked={form.requiresNOC} onChange={e => update('requiresNOC', e.target.checked)} />Require a signed NOC</label>{form.participationType !== 'solo' && <>{input('minTeamSize', 'Minimum team size', {
            type: 'number',
            min: 1,
            max: 100,
            required: true
          })}{input('maxTeamSize', 'Maximum team size', {
            type: 'number',
            min: 1,
            max: 100,
            required: true
          })}</>}</div><Field label="Description"><textarea rows={4} value={form.description} maxLength={5000} onChange={e => update('description', e.target.value)} /></Field><Field label="Rules" hint="One rule per line."><textarea rows={4} value={form.rules} onChange={e => update('rules', e.target.value)} /></Field>{event._id && <p className="muted">Existing registrations keep their original fee. Once registrations exist, the event date, team rules and NOC requirement are locked.</p>}{form.status === 'cancelled' && <label className="check-field"><input type="checkbox" checked={confirmCancel} onChange={e => setConfirmCancel(e.target.checked)} />I understand cancellation closes entry. Refunds must be reviewed separately.</label>}<button className="primary-button" disabled={busy || form.status === 'cancelled' && !confirmCancel}>{busy ? 'Saving…' : 'Save event'}</button></form></ReviewDialog>;
}
