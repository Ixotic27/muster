import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, LoadState, Notice, Pagination, Refresh, Status, useResource, date } from './Portal';
import ParticipantAcademicDetails from './ParticipantAcademicDetails';
import { downloadRoster } from '../../utils/rosterDownload';
import '../../styles/eventOperations.css';
const filters = [['all', 'Registered', 'registered'], ['not_paid', 'Not paid', 'notPaid'], ['paid', 'Paid', 'paid'], ['attended', 'Attended', 'attended']];
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
export default function ParticipantRoster({
  endpoint,
  eventId = '',
  query,
  admin = false,
  onReview
}) {
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState('all');
  const [search, setSearch] = useState(''),
    [submittedSearch, setSubmittedSearch] = useState('');
  const [downloading, setDownloading] = useState(false),
    [error, setError] = useState('');
  const q = query === undefined ? submittedSearch : query;
  const params = new URLSearchParams({
    filter,
    q
  });
  if (eventId) params.set('eventId', eventId);
  const resource = useResource(endpoint + '?' + params.toString() + '&page=' + page);
  const refresh = resource.refresh;
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(refreshVisible, 15000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refresh]);
  const data = resource.data,
    participants = data?.stats?.participants,
    teams = data?.stats?.teams;
  const filtered = data?.filtered || data?.stats?.filtered;
  const changeFilter = value => {
    setFilter(value);
    setPage(1);
    setError('');
  };
  async function download() {
    if (downloading) return;
    setDownloading(true);
    setError('');
    try {
      await downloadRoster(endpoint + '/export?' + params.toString(), 'eventflow-' + (eventId || 'participants') + '-' + filter + '.csv');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }
  return <section className="participant-roster" aria-label="Participant roster">
    <div className="section-heading"><h2>Participant roster</h2><Refresh onClick={resource.refresh} /></div>
    <p className="muted">Refreshes automatically every 15 seconds while this page is visible.</p>
    <p>Counts are individual participants{teams ? ', with team totals shown separately' : ''}. Cancelled and refunded entries are excluded. Paid includes verified payments and entries with no fee. Attendance is recorded for each person at entry.</p>
    <div className="participant-counts" aria-label="Participant totals">{filters.map(([value, label, key]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => changeFilter(value)}><strong>{participants?.[key] ?? '—'}</strong><span>{label}</span>{teams && <small>{plural(teams[key] ?? 0, 'team')}{value === 'paid' ? ' with paid participants' : value === 'attended' ? ' with recorded attendance' : value === 'not_paid' ? ' with unpaid participants' : ''}</small>}</button>)}</div>
    <form className="operations-filters" onSubmit={e => {
      e.preventDefault();
      setPage(1);
      setSubmittedSearch(search);
    }}>
      {query === undefined && <Field label="Find a participant or team" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email, student ID, team or reference" />}
      <Field label="Participant filter"><select value={filter} onChange={e => changeFilter(e.target.value)}>{filters.map(([value, label]) => <option value={value} key={value}>{label}</option>)}<option value="payment_submitted">Payment submitted for review</option></select></Field>
      {query === undefined && <button className="secondary-button" type="submit">Search participants</button>}
      <button className="secondary-button" type="button" disabled={downloading || resource.loading || !data || !data.groups?.length} onClick={download}>{downloading ? 'Downloading…' : 'Download filtered participants (CSV)'}</button>
    </form>
    <Notice>{error}</Notice><LoadState resource={resource} />
    {data && <>
      {filtered && <p className="muted">{plural(filtered.participants, 'matching participant')} in {plural(filtered.groups, 'registration group')}. Downloads include all matching participants across every page.</p>}
      {filter !== 'all' && <p className="muted">Expand a team to see its full roster. Members outside this filter are labeled and excluded from the download.</p>}
      {!data.groups?.length ? <div className="portal-empty"><h3>No matching participants</h3><p>Try another participant filter or clear your search.</p></div> : <div className="roster-list">{data.groups.map(group => <article className="roster-row" key={group._id}>
        <details><summary><span className="roster-summary"><strong>{group.kind === 'team' ? group.teamName || 'Unnamed team' : group.members?.[0]?.participant?.name || 'Individual participant'}</strong><span>{plural(group.participantCount ?? group.members?.length ?? 0, 'participant')}</span><span>{group.paidCount ?? 0} paid · {group.attendedCount ?? 0} attended</span><Status value={group.status} /></span></summary>
          {group.event?.name && <p>{group.event.name}</p>}
          <p>Attendance: {group.attendance === 'all' ? 'All participants attended' : group.attendance === 'partial' ? 'Some participants attended' : 'No participants attended'}</p>
          <ul className="roster-members">{(group.members || []).map((member, i) => <li className="roster-member" key={member.userId || member.registrationId || i} data-matches-filter={member.matchesFilter !== false}>
            <div className="roster-member-heading"><strong>{member.participant?.name || 'Participant'}</strong>{member.leader && <span className="status-pill">Team leader</span>}<span className={'status-pill status-' + (member.paid ? 'confirmed' : 'pending_payment')}>{member.paymentStatus === 'not_required' ? 'No fee required' : member.paid ? 'Paid' : member.paymentStatus === 'submitted' ? 'Payment under review' : 'Not paid'}</span><span className={'status-pill status-' + (member.attended ? 'checked_in' : 'pending')}>{member.attended ? 'Attended' : 'Not attended'}</span></div>
            {member.matchesFilter === false && <p className="muted">Outside current filter</p>}
            <p>{member.participant?.email || 'Email not provided'}{member.participant?.phone && <> · {member.participant.phone}</>}</p>
            <small>{member.regId || 'Registration reference unavailable'} · {(member.registrationStatus || 'pending').replaceAll('_', ' ')}</small>
            <small>NOC: {(member.nocStatus || 'not_required').replaceAll('_', ' ')}</small>
            {member.checkedInAt && <small>Checked in {date(member.checkedInAt)}</small>}
            <ParticipantAcademicDetails participant={member.participant} />
            {admin && (onReview ? <button type="button" className="quiet-button" onClick={() => onReview({
                  _id: member.registrationId,
                  regId: member.regId
                }, 'registration')}>View registration</button> : <Link className="text-link" to={'/admin/registrations?q=' + encodeURIComponent(member.regId || '')}>Review registration</Link>)}
          </li>)}</ul>
        </details>
      </article>)}</div>}
      <Pagination value={data.pagination} onPage={setPage} busy={resource.loading} />
    </>}
  </section>;
}
