import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { eventFormPayload, registrationAvailability } from '../../utils/eventPresentation';
import { Field, Notice } from './Portal';
import '../../styles/eventOperations.css';
const localDate = value => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const values = event => ({
  status: event.status,
  registrationDeadline: localDate(event.registrationDeadline),
  maxSlots: event.maxSlots ?? ''
});
export default function RegistrationControls({
  event,
  onSaved
}) {
  const [form, setForm] = useState(() => values(event));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    setForm(values(event));
  }, [event]);
  const unavailable = registrationAvailability(event);
  const editable = ['published', 'closed'].includes(event.status);
  const initial = values(event);
  const changed = Object.keys(form).some(key => form[key] !== initial[key]);
  const update = (key, value) => {
    setForm(previous => ({
      ...previous,
      [key]: value
    }));
    setMessage('');
  };
  async function save(e) {
    e.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/events/manage/' + event._id + '/registration-controls', {
        method: 'PATCH',
        body: eventFormPayload(form, event, initial)
      });
      await onSaved();
      setMessage('Registration controls saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="portal-card registration-controls" aria-label="Registration controls">
    <div className="section-heading"><h2>Registration controls</h2><span className={'status-pill status-' + (unavailable ? 'closed' : 'published')}>{unavailable ? 'Registration closed' : 'Registration open'}</span></div>
    {unavailable && <p>{unavailable}</p>}
    <p>Registration closes automatically at the deadline, when capacity is reached, or when the event starts.</p>
    {!editable ? <p className="muted">An administrator must publish this event before registration controls are available.</p> : <form className="portal-form" onSubmit={save}>
      <fieldset disabled={busy} className="registration-control-fields">
        <div className="form-grid">
          <Field label="Registration setting" hint="Opening registration still respects the deadline and capacity."><select value={form.status} onChange={e => update('status', e.target.value)}><option value="published">Open registration</option><option value="closed">Close registration</option></select></Field>
          <Field label="Registration deadline (your device time)" type="datetime-local" value={form.registrationDeadline} onChange={e => update('registrationDeadline', e.target.value)} hint="Leave blank to accept entries until the event starts." />
          <Field label={event.participationType === 'team' ? 'Team registration capacity' : 'Registration capacity'} type="number" min="1" step="1" value={form.maxSlots} onChange={e => update('maxSlots', e.target.value)} hint={event.participationType === 'team' ? 'Counts teams, not individual members. Leave blank for unlimited teams.' : 'Counts registrations. Leave blank for unlimited registrations.'} />
        </div>
        <button className="primary-button" disabled={!changed}>{busy ? 'Saving…' : 'Save registration controls'}</button>
      </fieldset>
    </form>}
    <Notice>{error}</Notice><Notice success>{message}</Notice>
  </section>;
}
