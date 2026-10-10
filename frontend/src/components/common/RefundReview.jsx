import { useState } from 'react';
import { api } from '../../utils/api';
import { Field, Notice, money, date } from './Portal';
export default function RefundReview({
  item,
  endpoint,
  onSaved,
  onBusyChange
}) {
  const [reference, setReference] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [received, setReceived] = useState(false),
    [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = item.refundReviewStatus === 'pending' || !item.refundReviewStatus && item.status === 'refund_requested';
  const submitted = item.paymentId?.status === 'submitted';
  async function save(approve, e) {
    e.preventDefault();
    if (busy || approve && (!confirmed || submitted && !received || reference.trim().length < 3) || !approve && reason.trim().length < 3) return;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      await api(endpoint + '/' + item._id + (approve ? '/approve' : '/reject'), {
        method: 'POST',
        body: approve ? {
          confirmed: true,
          reference: reference.trim(),
          ...(submitted ? {
            paymentReceivedConfirmed: true
          } : {})
        } : {
          reason: reason.trim()
        }
      });
      await onSaved(approve ? 'Manual refund recorded as completed. The registration team is withdrawn and notification emails are queued.' : 'Refund declined with your explanation. The entry stays cancelled; notification emails are queued.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return <><Notice>{error}</Notice><h3>{item.teamId?.teamName || item.leaderId?.name || 'Participant'}</h3><p>{item.eventId?.name} · {item.regId}</p><dl className="summary-list"><div><dt>Requested amount</dt><dd>{money(item.refundAmountInr ?? item.feeSnapshotInr)}</dd></div><div><dt>Reason</dt><dd>{item.refundReason || 'Not provided'}</dd></div>{item.refundRequestedAt && <div><dt>Requested</dt><dd>{date(item.refundRequestedAt)}</dd></div>}{item.paymentId?.utr && <div><dt>Original payment UTR</dt><dd>{item.paymentId.utr}</dd></div>}{item.paymentId?.status && <div><dt>Payment review</dt><dd>{item.paymentId.status}</dd></div>}{item.refundReference && <div><dt>Refund reference</dt><dd>{item.refundReference}</dd></div>}{item.refundReviewedAt && <div><dt>Reviewed</dt><dd>{date(item.refundReviewedAt)}{item.refundReviewedBy?.name ? ' · ' + item.refundReviewedBy.name : ''}</dd></div>}{item.refundRejectionReason && <div><dt>Decline reason</dt><dd>{item.refundRejectionReason}</dd></div>}</dl>
    {pending ? <><Notice>This records a manual bank refund that you have already completed. It does not transfer money. Completion or rejection withdraws the registration team; rejected refunds do not restore entry.</Notice><form className="portal-form" onSubmit={e => save(true, e)}><Field label="Refund transfer reference" value={reference} onChange={e => setReference(e.target.value)} required minLength={3} maxLength={120} hint="Enter the bank reference for the refund, not the original payment UTR." />{submitted && <label className="check-field"><input type="checkbox" required checked={received} onChange={e => setReceived(e.target.checked)} />I checked the bank record and confirmed the original payment was received.</label>}<label className="check-field"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I completed and verified the refund transfer.</label><button className="primary-button" disabled={busy || !confirmed || submitted && !received || reference.trim().length < 3}>{busy ? 'Saving…' : 'Mark refund completed'}</button></form><form className="portal-form rejection-form" onSubmit={e => save(false, e)}><Field label="Reason for declining refund" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} maxLength={500} hint="This explanation will be sent to the participant." /><button className="secondary-button" disabled={busy || reason.trim().length < 3}>Decline refund request</button></form></> : <p>This request has been reviewed. Historical refund and registration records are retained.</p>}
  </>;
}
