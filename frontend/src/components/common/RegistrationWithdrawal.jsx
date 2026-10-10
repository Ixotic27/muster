import { useState } from 'react';
import { api } from '../../utils/api';
import { Field, Notice, date, money } from './Portal';
import { ReviewDialog } from './Operations';
export default function RegistrationWithdrawal({
  registration: r,
  owner,
  onSaved
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const policy = r.withdrawal,
    refund = policy?.action === 'request_refund';
  const canWithdraw = policy?.allowed && ['cancel', 'request_refund'].includes(policy.action);
  const history = r.refundRequestedAt || r.refundedAt || r.cancelledAt || r.refundReviewStatus;
  async function submit(e) {
    e.preventDefault();
    if (busy || !confirmed || !canWithdraw || reason.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/registrations/' + r._id + (refund ? '/refund-request' : '/cancel'), {
        method: 'POST',
        body: {
          reason: reason.trim()
        }
      });
      setOpen(false);
      setMessage(result.message || (refund ? 'Refund request recorded. The organizers will review your payment and request. Related emails are queued.' : 'Registration deleted from participation. Related emails are queued.'));
      await onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="portal-card" aria-label="Cancellation and refunds"><h2>Cancellation & refunds</h2><Notice success>{message}</Notice>
    {history && <dl className="summary-list">{r.refundRequestedAt && <div><dt>Requested</dt><dd>{date(r.refundRequestedAt)}</dd></div>}{r.refundReason && <div><dt>Your reason</dt><dd>{r.refundReason}</dd></div>}{r.refundReviewStatus && <div><dt>Refund review</dt><dd>{r.refundReviewStatus.replaceAll('_', ' ')}</dd></div>}{r.refundedAt && <><div><dt>Refund completed</dt><dd>{date(r.refundedAt)} · {money(r.refundAmountInr ?? r.feeSnapshotInr)}</dd></div>{r.refundReference && <div><dt>Transfer reference</dt><dd>{r.refundReference}</dd></div>}</>}{r.refundRejectionReason && <div><dt>Refund declined</dt><dd>{r.refundRejectionReason}. No funds were returned. Your entry remains cancelled.</dd></div>}</dl>}
    {r.status === 'refund_requested' && <p>Your passes cannot be used while the request is reviewed. {''}This page will refresh while you wait.</p>}
    {['cancelled', 'refunded'].includes(r.status) && <p>Your entry and any shared registration team have been withdrawn. Historical records remain available here.</p>}
    {owner && canWithdraw ? <><p>{refund ? 'Already transferred the fee? Request a manual refund from the event organizers. Your entry passes will be revoked immediately.' : 'Delete this unpaid registration and withdraw from the event. A shared registration also withdraws the whole team.'}</p>{policy.cutoff && <p>{refund ? 'Refund requests close' : 'Online withdrawal closes'} {date(policy.cutoff)}.</p>}<button className="secondary-button" onClick={() => {
        setOpen(true);
        setError('');
        setConfirmed(false);
      }}>{refund ? 'Request refund' : r.teamId ? 'Delete team / registration' : 'Delete registration'}</button></> : owner && policy?.reason && <p>{policy.reason}</p>}
    {!owner && <p>Only the registration owner or team leader can withdraw this registration. You can follow its status here.</p>}
    {open && <ReviewDialog title={refund ? 'Request a refund' : 'Delete this registration?'} busy={busy} onClose={() => setOpen(false)}><Notice>{error}</Notice><p>{refund ? 'This submits a request; it does not automatically return money. Entry passes become unavailable immediately.' : 'This withdraws the registration and its shared team. You cannot undo this action here.'}</p><form className="portal-form" onSubmit={submit}><Field label={refund ? 'Reason for refund request' : 'Reason for withdrawing'} value={reason} onChange={e => setReason(e.target.value)} required minLength={3} maxLength={500} /><label className="check-field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />{r.teamId ? 'I understand this withdraws the registration for every teammate.' : 'I want to withdraw my entry.'}</label><button className="primary-button" disabled={busy || !confirmed || reason.trim().length < 3}>{busy ? 'Saving…' : refund ? 'Send refund request' : 'Confirm deletion'}</button></form></ReviewDialog>}
  </section>;
}
