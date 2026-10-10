import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Users, CreditCard, QrCode, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { PageHead, Status, Notice, Empty, LoadState, useResource, money, date, Refresh } from '../components/common/Portal';
export default function Dashboard() {
  const {
      user
    } = useAuth(),
    registrations = useResource('/registrations/mine'),
    teams = useResource('/teams/mine'),
    invites = useResource('/teams/invites'),
    notifications = useResource('/notifications');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const list = registrations.data?.registrations || [],
    teamList = teams.data?.teams || [];
  const canUseScanner = ['organizer', 'admin', 'super_admin'].includes(user.role);
  async function accept(id) {
    setBusy(true);
    setError('');
    try {
      await api('/teams/invites/' + id + '/accept', {
        method: 'POST'
      });
      await Promise.all([invites.refresh(), teams.refresh()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => {
    registrations.refresh();
    teams.refresh();
    invites.refresh();
    notifications.refresh();
  };
  return <div className="portal"><PageHead title={'Hey, ' + user.name.split(' ')[0] + '.'} action={<Link className="primary-button" to="/events">Explore events →</Link>}>Your registrations, teams, payments, and passes. All set for what’s next.</PageHead>
    <nav className="portal-shortcuts"><Link to="/dashboard/passes"><Ticket />My entry passes</Link><Link to="/profile"><UserRound />My profile</Link>{canUseScanner && <Link to="/scanner"><QrCode />Staff entry scanner</Link>}{['admin', 'super_admin'].includes(user.role) && <Link to="/admin"><CreditCard />Admin reviews</Link>}</nav>
    <div className="stat-grid"><article><Ticket /><strong>{registrations.data ? list.length : '—'}</strong><span>Registrations</span></article><article><CreditCard /><strong>{registrations.data ? list.filter(r => ['pending_payment', 'payment_submitted'].includes(r.status)).length : '—'}</strong><span>Payment actions / reviews</span></article><article><Users /><strong>{teams.data ? teamList.length : '—'}</strong><span>Teams</span></article></div>
    <Notice>{error}</Notice>
    <section className="portal-card"><div className="section-heading"><h2>My registrations</h2><Refresh onClick={refresh} /></div><LoadState resource={registrations} />
      {registrations.data && (!list.length ? <Empty title="Your next challenge is waiting." to="/events" label="Find an event">Choose an event, register, and follow your payment review here.</Empty> : <div className="card-grid">{list.map(r => <article className="registration-tile" key={r._id}><Status value={r.status} /><h3>{r.eventId?.name}</h3><p>{date(r.eventId?.eventDate)}</p><p>{r.teamId?.teamName || 'Solo entry'} · {money(r.feeSnapshotInr)}</p><small>{r.regId}</small><Link className="secondary-button" to={'/registrations/' + r._id}>{r.status === 'pending_payment' ? 'Pay & submit proof' : r.status === 'pending_noc' ? 'Upload / track NOC' : 'View registration'}</Link></article>)}</div>)}
    </section>
    <div className="portal-columns equal"><section className="portal-card"><h2>Teams & invitations</h2><LoadState resource={invites} /><LoadState resource={teams} />
      {invites.data?.invites.map(invite => <article className="list-row" key={invite._id}><div><strong>{invite.teamId?.teamName}</strong><p>{invite.eventId?.name}</p><small>Expires {date(invite.expiresAt)}</small></div><>{invite.requiresToken ? <small>Open the invitation link in your email to accept or decline.</small> : <button className="primary-button" disabled={busy} onClick={() => accept(invite._id)}>Accept invite</button>}</></article>)}
      {teamList.map(team => <article className="list-row" key={team._id}><div><strong>{team.teamName}</strong><p>{team.eventId?.name} · {team.members.filter(m => m.status === 'accepted').length} members</p><small>Join code: {team.joinCode}</small></div><Link className="text-link" to={'/events/' + team.eventId?.slug + '/register'}>Manage →</Link></article>)}
      {teams.data && invites.data && !teamList.length && !invites.data.invites.length && <p className="muted">No teams or invitations yet. Create or join a team from an event’s registration page.</p>}
    </section><section className="portal-card"><div className="section-heading"><h2>Updates</h2><button className="quiet-button" onClick={async () => {
            try {
              await api('/notifications/read-all', {
                method: 'POST'
              });
              notifications.refresh();
            } catch (e) {
              setError(e.message);
            }
          }}>Mark all read</button></div><LoadState resource={notifications} />
      {notifications.data?.notifications?.length ? notifications.data.notifications.map(n => <article className={'notification-row ' + (!n.readAt ? 'unread' : '')} key={n._id}><strong>{n.title}</strong><p>{n.message}</p><small>{date(n.createdAt)}</small></article>) : notifications.data && <p className="muted">Payment reviews, team invitations, and entry-pass updates will appear here.</p>}
    </section></div>
  </div>;
}
