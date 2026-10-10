import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DeleteTeam from '../components/common/DeleteTeam';
import { api } from '../utils/api';
import { registrationAvailability } from '../utils/eventPresentation';
import { Field, Notice, PageHead, LoadState, useResource, money, date, idOf, Steps, Refresh } from '../components/common/Portal';
export default function RegisterPage() {
  const {
      slug
    } = useParams(),
    navigate = useNavigate(),
    {
      user
    } = useAuth();
  const eventResource = useResource('/events/' + slug),
    teams = useResource('/teams/mine'),
    registrations = useResource('/registrations/mine');
  const [choice, setChoice] = useState('solo'),
    [teamName, setTeamName] = useState(''),
    [joinCode, setJoinCode] = useState(''),
    [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [agreed, setAgreed] = useState(false);
  const event = eventResource.data?.event;
  const team = teams.data?.teams.find(t => idOf(t.eventId) === event?._id && t.status !== 'cancelled');
  const existing = registrations.data?.registrations.find(r => idOf(r.eventId) === event?._id);
  const members = team?.members.filter(m => m.status === 'accepted') || [];
  const leader = team && idOf(team.leaderId) === user._id;
  const complete = Boolean(user.name && user.email);
  const enrollmentClosed = event ? registrationAvailability(event) : '';
  const wantsTeam = event?.participationType === 'team' || choice === 'team' || Boolean(team);
  async function action(fn) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <div className="portal"><PageHead kicker="Event registration" title={event?.name || 'Register for an event'}>Follow each step to receive your entry pass.</PageHead>
    <Steps current={complete ? 1 : 0} /><LoadState resource={eventResource} />
    {event && <div className="portal-columns">
      <div className="portal-stack">
        {existing ? <section className="portal-card"><h2>You already have a registration</h2><p>Reference: <strong>{existing.regId}</strong>. Resume from where you left off.</p><Link className="primary-button" to={'/registrations/' + existing._id}>View registration & payment</Link></section> : <>
        <section className="portal-card"><div className="section-heading"><h2>01 / Your details</h2><Link className="text-link" to={'/profile?next=' + encodeURIComponent('/events/' + slug + '/register')}>Edit profile</Link></div><dl className="summary-list"><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Organization</dt><dd>{user.college || 'Not provided'}</dd></div><div><dt>Student ID</dt><dd>{user.studentId || 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{user.phone || 'Not provided'}</dd></div></dl>{!complete && <Notice>Please complete your name and email before registering.</Notice>}</section>
        <section className="portal-card"><div className="section-heading"><h2>02 / {event.participationType === 'solo' ? 'Solo entry' : 'Your team'}</h2><Refresh onClick={teams.refresh} /></div>
          <LoadState resource={teams} />
          {event.participationType === 'both' && !team && <div className="segmented"><button className={choice === 'solo' ? 'selected' : ''} onClick={() => setChoice('solo')}>Participate solo</button><button className={choice === 'team' ? 'selected' : ''} onClick={() => setChoice('team')}>With a team</button></div>}
          {!wantsTeam ? <p>You will register as an individual participant. Your entry pass will be issued in your name.</p> : team ? <>
            <h3>{team.teamName}</h3><p>{members.length} / {event.maxTeamSize} members · Minimum {event.minTeamSize} required</p>
            <div className="join-code"><span>Share this join code</span><strong>{team.joinCode}</strong><button className="quiet-button" onClick={() => action(async () => {
                  await navigator.clipboard.writeText(team.joinCode);
                  setMessage('Join code copied. Share it with your teammates.');
                })}>Copy code</button></div>
            <ul className="member-list">{members.map(m => <li key={m._id || m.userId}><span>{m.nameSnapshot}<small>{m.studentIdSnapshot}</small></span><span>{idOf(team.leaderId) === idOf(m.userId) ? 'Leader' : 'Member'}</span></li>)}</ul>
            {leader ? <form className="portal-form" onSubmit={e => {
                e.preventDefault();
                action(async () => {
                  const response = await api('/teams/' + team._id + '/invites', {
                    method: 'POST',
                    body: {
                      email
                    }
                  });
                  setEmail('');
                  setMessage(response.message || 'Invitation successfully sent and queued for delivery.');
                });
              }}><Field label="Invite a teammate by email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Teammate's email (new or registered)" required /><button className="secondary-button" disabled={busy || team.status !== 'forming' || members.length >= event.maxTeamSize}>Send invitation</button><Notice success>{message && 'Invitation successfully sent. ' + message}</Notice></form> : <Notice success>Your team leader will submit the registration and payment for the whole team.</Notice>}
            {leader && team.status === 'forming' && <DeleteTeam team={team} disabled={busy} onSaved={async text => {
                setMessage(text);
                await teams.refresh();
              }} />}
            <button className="quiet-button" disabled={busy || team.status !== 'forming'} onClick={() => action(async () => {
                await api('/teams/' + team._id + '/leave', {
                  method: 'POST'
                });
                await teams.refresh();
              })}>Leave team{leader && members.length > 1 ? ' and transfer leadership' : ''}</button>
          </> : <><p>Create a team and invite {event.minTeamSize - 1}–{event.maxTeamSize - 1} teammates, or join using your leader's code. Everyone needs their own account.</p>
            <form className="portal-form" onSubmit={e => {
                e.preventDefault();
                action(async () => {
                  await api('/teams', {
                    method: 'POST',
                    body: {
                      eventId: event._id,
                      teamName
                    }
                  });
                  await teams.refresh();
                });
              }}><Field label="New team name" value={teamName} onChange={e => setTeamName(e.target.value)} minLength={2} maxLength={80} required /><button className="secondary-button" disabled={busy || !complete}>Create team</button></form>
            <div className="portal-divider">or join an existing team</div><form className="portal-form" onSubmit={e => {
                e.preventDefault();
                action(async () => {
                  await api('/teams/join', {
                    method: 'POST',
                    body: {
                      joinCode,
                      eventId: event._id
                    }
                  });
                  await teams.refresh();
                });
              }}><Field label="Team join code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="EVT-XXXXXX" required maxLength={20} /><button className="secondary-button" disabled={busy || !complete}>Join team</button></form></>}
        </section>
        <section className="portal-card"><h2>03 / Review & continue</h2><Notice>{enrollmentClosed}</Notice><p>{event.feeInr === 0 ? `This event is free. No payment is required.${event.requiresNOC ? ' Your entry pass is issued after document approval.' : ' Confirm your registration to receive your entry pass.'}` : `${wantsTeam ? 'The event fee is paid once by the leader for this team.' : 'The event fee is paid for your individual entry.'} Your slot is confirmed after payment verification${event.requiresNOC ? ' and document approval' : ''}.`}</p>
          <label className="check-field"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />I have read the event rules and checked my participant details.</label>
          <button className="primary-button" disabled={busy || !agreed || !complete || Boolean(enrollmentClosed) || teams.loading || registrations.loading || Boolean(registrations.error) || (wantsTeam && (!team || !leader || members.length < event.minTeamSize || members.length > event.maxTeamSize))} onClick={() => action(async () => {
              const r = await api('/registrations', {
                method: 'POST',
                body: {
                  eventId: event._id,
                  ...(wantsTeam ? {
                    teamId: team._id
                  } : {})
                }
              });
              navigate('/registrations/' + r.registration._id);
            })}>{busy ? 'Saving…' : event.feeInr === 0 ? 'Confirm registration' : 'Continue to payment'}{event.feeInr > 0 && <> — {money(event.feeInr)}</>}</button>
        </section></>}
        <Notice>{error || registrations.error}</Notice><Notice success>{message}</Notice>
      </div>
      <aside className="portal-card sticky-summary"><span className="eyebrow">Your event</span><h2>{event.name}</h2><dl className="summary-list"><div><dt>When</dt><dd>{date(event.eventDate)}</dd></div><div><dt>Where</dt><dd>{event.venue}</dd></div><div><dt>{'Entry'}</dt><dd>{event.minTeamSize === event.maxTeamSize ? event.minTeamSize : event.minTeamSize + '–' + event.maxTeamSize} participant(s)</dd></div><div><dt>Fee</dt><dd>{money(event.feeInr)}{''}</dd></div><div><dt>NOC</dt><dd>{event.requiresNOC ? 'Required before entry pass' : 'Not required'}</dd></div></dl><Link className="text-link" to={'/events/' + slug}>Read the event rules →</Link><p className="muted">Your dashboard keeps your registration, payment status, and entry pass together.</p></aside>
    </div>}
  </div>;
}
