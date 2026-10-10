import { useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Ticket, Users, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { Field, Notice, useResource } from '../components/common/Portal';
import CollegeSelect from '../components/common/CollegeSelect';
import YearSelect from '../components/common/YearSelect';
import { site } from '../config';
export default function AuthPage({
  initialMode
}) {
  const [params] = useSearchParams();
  const location = useLocation();
  const mode = initialMode || (params.get('mode') === 'signup' ? 'signup' : 'login');
  const signup = mode === 'signup',
    reset = mode === 'reset',
    forgot = mode === 'forgot';
  const nextParam = params.get('next') || '/dashboard';
  const next = /^\/(?!\/)/.test(nextParam) && !nextParam.includes('\\') && !/[\u0000-\u0020\u007f]/.test(nextParam) ? nextParam : '/dashboard';
  const {
    authenticate,
    user
  } = useAuth();
  const navigate = useNavigate(),
    config = useResource('/config');
  const requestedEmail = params.get('email') || '';
  const initialEmail = mode === 'login' && requestedEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail) ? requestedEmail : '';
  const [form, setForm] = useState({
    name: '',
    email: initialEmail,
    password: '',
    confirm: '',
    studentId: '',
    college: '',
    phone: '',
    course: '',
    specialization: '',
    section: '',
    year: ''
  });
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const change = e => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
    setError('');
  };
  async function submit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if ((signup || reset) && form.password !== form.confirm) {
      setError('The passwords do not match. Please re-enter them.');
      return;
    }
    setBusy(true);
    try {
      if (forgot) {
        const data = await api('/auth/forgot-password', {
          method: 'POST',
          body: {
            email: form.email
          }
        });
        setMessage(data.message);
      } else if (reset) {
        await api('/auth/reset-password', {
          method: 'POST',
          body: {
            token: new URLSearchParams(location.hash.slice(1)).get('token') || params.get('token') || '',
            newPassword: form.password
          }
        });
        setMessage('Password updated. You can now log in with your new password.');
      } else {
        const {
          confirm,
          ...values
        } = form;
        const account = await authenticate(mode, signup ? {
          ...values,
          year: form.year ? Number(form.year) : null
        } : {
          email: form.email,
          password: form.password
        });
        setForm(previous => ({
          ...previous,
          password: '',
          confirm: ''
        }));
        navigate(account?.mustChangePassword ? `/change-password?next=${encodeURIComponent(next)}` : next, {
          replace: true
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const title = signup ? 'Your next event starts here.' : reset ? 'A fresh start.' : forgot ? 'Forgot your password?' : 'Back for more?';
  const destination = m => '/auth?mode=' + m + '&next=' + encodeURIComponent(next);
  return <div className="auth-experience">
    <aside className="auth-story">
      <span className="auth-edition">{site.name}</span><h2>SHOW UP.<br />TEAM UP.<br /><em>STAND OUT.</em></h2>
      <p>One account. Your teams, registrations and passes, in one place.</p>

      <div className="auth-benefits"><span><Users size={19} /> Build your team</span><span><Ticket size={19} /> Track registrations</span><span><QrCode size={19} /> Carry your entry pass</span></div>
    </aside>
    <section className="auth-form-panel">
      {!forgot && !reset && <nav className="auth-tabs" aria-label="Account options"><Link className={!signup ? 'selected' : ''} to={destination('login')}>Log in</Link><Link className={signup ? 'selected' : ''} to={destination('signup')}>Sign up</Link></nav>}
      <span className="eyebrow">{signup ? `Join ${site.name}` : `Welcome to ${site.name}`}</span><h1>{title}</h1>
      <p>{signup ? 'Create your participant account to register, pay, and collect your entry passes.' : forgot ? 'Enter your account email to request a password reset link.' : reset ? 'Choose a new password for your account.' : 'Log in to your registrations, teammates, payments, and passes.'}</p>
      {user && <Notice success>You are already signed in as {user.name}. <Link to={user.mustChangePassword ? '/change-password' : next}>{user.mustChangePassword ? 'Choose your own password to continue →' : 'Continue to your dashboard →'}</Link></Notice>}
      <form className="portal-form" onSubmit={submit}>
        {signup && <Field label="Full name" name="name" autoComplete="name" value={form.name} onChange={change} required minLength={2} maxLength={120} placeholder="Your name as on your photo ID" />}
        {!reset && <Field label="Email address" type="email" name="email" autoComplete="email" value={form.email} onChange={change} required maxLength={254} placeholder="you@example.com" hint={signup ? 'Use any email you can access, including a personal email. ' : undefined} />}
        {!forgot && <><div className="password-field"><Field label={reset ? 'New password' : 'Password'} type={show ? 'text' : 'password'} name="password" autoComplete={signup || reset ? 'new-password' : 'current-password'} value={form.password} onChange={change} required minLength={signup || reset ? 8 : undefined} maxLength={128} hint={signup || reset ? 'Use 8–128 characters. Choose a password you do not use elsewhere.' : undefined} /><button type="button" className="password-toggle" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>
        {(signup || reset) && <Field label="Confirm password" type="password" name="confirm" autoComplete="new-password" value={form.confirm} onChange={change} required minLength={8} maxLength={128} />}</>}
        {signup && <><div className="form-grid"><CollegeSelect value={form.college} onChange={change} /><Field label="Participant / student ID (optional)" name="studentId" value={form.studentId} onChange={change} maxLength={40} placeholder="Your enrollment number" /></div>
          <p>Optional profile details help organizers prepare certificates when needed.</p>
          <div className="form-grid"><Field label="Course (optional)" name="course" value={form.course} onChange={change} maxLength={120} placeholder="e.g. B.Tech Computer Science" /><Field label="Specialization (optional)" name="specialization" value={form.specialization} onChange={change} maxLength={120} placeholder="e.g. Artificial Intelligence" hint="Leave blank if not applicable." /></div>
          <div className="form-grid"><Field label="Section (optional)" name="section" value={form.section} onChange={change} maxLength={40} placeholder="e.g. Section A" /><YearSelect value={form.year} onChange={change} /></div>
          <Field label="Phone number (optional)" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={change} pattern="[+0-9 ()-]{10,20}" maxLength={20} placeholder="Your contact number" hint="Used by event organizers for registration updates." /></>}
        {!signup && !forgot && !reset && <Link className="text-link align-right" to="/forgot-password">Forgot password?</Link>}
        <Notice>{error}</Notice><Notice success>{message}</Notice>
        {forgot && config.data?.config?.password_reset_available === false && <Notice>Email password reset is not available yet. Contact the organizers for account recovery.</Notice>}
        <button className="primary-button portal-submit" disabled={busy || forgot && config.data?.config?.password_reset_available === false}>{busy ? 'Please wait…' : signup ? 'Create account' : forgot ? 'Send reset link' : reset ? 'Update password' : 'Log in'} <ArrowRight size={18} /></button>
      </form>
      {signup ? <p className="auth-switch">Already have an account? <Link to={destination('login')}>Log in</Link></p> : <p className="auth-switch">New to {site.name}? <Link to={destination('signup')}>Sign up — create your account</Link></p>}
      {(forgot || reset) && <Link className="text-link" to="/auth">← Back to log in</Link>}
    </section>
  </div>;
}
