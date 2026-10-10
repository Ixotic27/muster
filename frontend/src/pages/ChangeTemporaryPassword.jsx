import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { Field, Notice, PageHead } from '../components/common/Portal';
export default function ChangeTemporaryPassword() {
  const {
    user,
    setUser,
    logout
  } = useAuth();
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const [form, setForm] = useState({
    newPassword: '',
    confirm: ''
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sessionExpired, setSessionExpired] = useState(false);
  const nextParam = params.get('next') || '/manager';
  const next = /^\/(?!\/)/.test(nextParam) && !nextParam.includes('\\') && !/[\u0000-\u0020\u007f]/.test(nextParam) && !/^\/(?:auth|change-password|staff-activation)(?:[/?#]|$)/.test(nextParam) ? nextParam : '/manager';
  const change = event => {
    setForm(previous => ({
      ...previous,
      [event.target.name]: event.target.value
    }));
    setError('');
  };
  async function submit(event) {
    event.preventDefault();
    if (busy || sessionExpired) return;
    setError('');
    if (form.newPassword.length < 8 || form.newPassword.length > 128) {
      setError('Use a password between 8 and 128 characters.');
      return;
    }
    if (form.newPassword !== form.confirm) {
      setError('The passwords do not match. Please re-enter them.');
      return;
    }
    setBusy(true);
    try {
      const result = await api('/auth/change-temporary-password', {
        method: 'POST',
        body: {
          newPassword: form.newPassword
        }
      });
      if (!result.user || result.user.mustChangePassword) throw new Error('Your password change could not be confirmed. Please try again.');
      setForm({
        newPassword: '',
        confirm: ''
      });
      setUser(result.user);
      navigate(next, {
        replace: true
      });
    } catch (failure) {
      if (failure.status === 401) {
        setSessionExpired(true);
        setForm({
          newPassword: '',
          confirm: ''
        });
      }
      setError(failure.message || 'Your password could not be updated. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function leaveSession() {
    try {
      await logout();
      navigate('/forgot-password', {
        replace: true
      });
    } catch (failure) {
      setError(failure.message || 'Could not sign out. Please try again.');
    }
  }
  if (!user) return <Navigate to="/auth?mode=login" replace />;
  if (!user.mustChangePassword) return <Navigate to={next} replace />;
  return <div className="portal">
    <PageHead kicker="Staff account security" title="Choose your own password">You are signed in as {user.email}. Replace your temporary password to open your staff tools.</PageHead>
    <div className="portal-columns equal">
      <section className="portal-card">
        <h2>Set your private password</h2>
        <form className="portal-form" onSubmit={submit} aria-busy={busy}>
          <Field label="New password" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy || sessionExpired} value={form.newPassword} onChange={change} hint="Use 8–128 characters. Choose a password you do not use elsewhere." />
          <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy || sessionExpired} value={form.confirm} onChange={change} />
          <Notice>{error}</Notice>
          {sessionExpired && <p>Your setup session has ended. Your temporary password has already been used. <Link className="text-link" to="/forgot-password">Request a password reset</Link> to finish setting up your account.</p>}
          <button className="primary-button" disabled={busy || sessionExpired}>{busy ? 'Saving your password…' : 'Save password and continue'}</button>
        </form>
      </section>
      <section className="portal-card">
        <h2>Complete this step first</h2>
        <p>Your temporary password is single-use. Your event assignments and staff permissions become available after you save your own password.</p>
        <p>This sign-in session lasts 15 minutes. Finish this step before it ends. If you need to leave, recover access with a password reset.</p>
        <button type="button" className="secondary-button" disabled={busy} onClick={leaveSession}>Sign out and reset password</button>
      </section>
    </div>
  </div>;
}
