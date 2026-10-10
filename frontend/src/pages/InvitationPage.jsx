import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { PageHead, Notice, date } from '../components/common/Portal';
import { site } from '../config';
export default function InvitationPage() {
  const {
      id
    } = useParams(),
    location = useLocation(),
    {
      user,
      loading,
      logout
    } = useAuth();
  const hashToken = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const queryToken = new URLSearchParams(location.search).get('token') || '';
  const token = hashToken || queryToken || (typeof window !== 'undefined' ? sessionStorage.getItem('eventflow-invite-token-' + id) || '' : '');
  const [invite, setInvite] = useState(null),
    [error, setError] = useState(''),
    [result, setResult] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (hashToken || queryToken) sessionStorage.setItem('eventflow-invite-token-' + id, hashToken || queryToken);
    if (loading || !user) return undefined;
    let active = true;
    api('/teams/invites/' + id + '/preview', {
      method: 'POST',
      body: {
        token
      }
    }).then(data => {
      if (active) setInvite(data.invite);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [id, token, loading, user, hashToken, queryToken]);
  async function respond(action) {
    setBusy(true);
    setError('');
    try {
      const data = await api('/teams/invites/' + id + '/' + action, {
        method: 'POST',
        body: {
          token
        }
      });
      setResult(data.message);
      sessionStorage.removeItem('eventflow-invite-token-' + id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  if (loading) return <div className="portal"><p role="status">Checking your session…</p></div>;
  if (!user) return <div className="portal"><PageHead title="You’re invited to a team">Create a {site.name} account or sign in with the email address that received this invitation.</PageHead><section className="portal-card"><Notice>{!token ? 'This invitation link is missing its security token. Ask the team leader to send a new invitation.' : ''}</Notice><div className="portal-shortcuts"><Link className="primary-button" to={'/auth?mode=signup&next=' + next}>Sign up to accept</Link><Link className="secondary-button" to={'/auth?mode=login&next=' + next}>Log in to accept</Link></div></section></div>;
  return <div className="portal"><PageHead title="Your team invitation">Sign in with the email address that received this invitation to respond.</PageHead>
    <section className="portal-card"><p>Signed in as <strong>{user.email}</strong></p><Notice>{error}</Notice><Notice success>{result}</Notice>
      {!invite && !error && <p role="status">Checking invitation…</p>}
      {invite && !result && <><h2>Join {invite.team?.teamName}</h2><h3>{invite.event?.name}</h3><p>{date(invite.event?.eventDate)} · {invite.event?.venue}</p><p>Invitation expires {date(invite.expiresAt)}</p><p>Accepting adds you to the team. Your team leader will complete the event registration and payment.</p>
        <div className="portal-shortcuts"><button className="primary-button" disabled={busy} onClick={() => respond('accept')}>Accept invitation</button><button className="secondary-button" disabled={busy} onClick={() => respond('reject')}>Decline</button></div></>}
      {error && /email address that received|another account/i.test(error) && <button className="secondary-button" onClick={async () => {
        try {
          await logout();
          setError('');
        } catch (e) {
          setError(e.message);
        }
      }}>Sign out and use the invited email</button>}
      <Link className="text-link" to="/dashboard">Go to my dashboard →</Link>
    </section></div>;
}
