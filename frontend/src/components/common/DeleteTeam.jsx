import { useState } from 'react';
import { api } from '../../utils/api';
import { ReviewDialog } from './Operations';
import { Notice } from './Portal';
export default function DeleteTeam({
  team,
  personal = false,
  disabled = false,
  onSaved
}) {
  const [open, setOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function remove(e) {
    e.preventDefault();
    if (busy || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/teams/' + team._id, {
        method: 'DELETE'
      });
      setOpen(false);
      await onSaved?.(result.message || 'Team deleted. Related emails are queued.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <><button className="quiet-button" disabled={disabled || busy} onClick={() => {
      setOpen(true);
      setConfirmed(false);
      setError('');
    }}>Delete team</button>{open && <ReviewDialog title={'Delete ' + team.teamName + '?'} busy={busy} onClose={() => setOpen(false)}><Notice>{error}</Notice><p>{personal ? 'This dissolves the playing team. Every player keeps their personal registration, payment and entry pass and can find another team. To withdraw from the event or request your own refund, open your personal registration.' : 'This dissolves the unregistered team and closes its invitations. Every teammate will be notified. It does not process a refund.'}</p><form className="portal-form" onSubmit={remove}><label className="check-field"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I understand the whole team will be dissolved.</label><button className="primary-button" disabled={busy || !confirmed}>{busy ? 'Deleting…' : 'Confirm team deletion'}</button></form></ReviewDialog>}</>;
}
