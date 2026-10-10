import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { PageHead, Field, Notice } from '../components/common/Portal';
import CollegeSelect from '../components/common/CollegeSelect';
import YearSelect from '../components/common/YearSelect';
export default function ProfileSetup() {
  const {
      user,
      setUser,
      logout
    } = useAuth(),
    [params] = useSearchParams();
  const [form, setForm] = useState({
    name: user.name,
    studentId: user.studentId || '',
    college: user.college || '',
    phone: user.phone || '',
    course: user.course || '',
    specialization: user.specialization || '',
    section: user.section || '',
    year: user.year || ''
  });
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirm: ''
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const next = params.get('next');
  const back = next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/dashboard';
  const change = e => setForm({
    ...form,
    [e.target.name]: e.target.value
  });
  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const data = await api('/profile', {
        method: 'PATCH',
        body: {
          ...form,
          year: form.year ? Number(form.year) : null
        }
      });
      setUser(data.user);
      setMessage('Profile saved. Your academic details are ready for certificates.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <div className="portal"><PageHead title="Your participant profile">Keep your name and contact details up to date. Organization and academic details are optional.</PageHead><div className="portal-columns equal"><section className="portal-card"><h2>Personal & organization details</h2><p>Email: <strong>{user.email}</strong></p><form className="portal-form" onSubmit={save}>
    <Field label="Full name" name="name" value={form.name} onChange={change} required minLength={2} maxLength={120} />
    <CollegeSelect value={form.college} onChange={change} />
    <div className="form-grid"><Field label="Student ID" name="studentId" value={form.studentId} onChange={change} maxLength={40} /><Field label="Phone number" name="phone" type="tel" value={form.phone} onChange={change} pattern="[+0-9 ()-]{10,20}" /></div>
    <h3>Academic details for certificates</h3><p>Use the course, specialization and section shown in your college records. You can add missing details here without changing your registrations.</p>
    {(!user.course || !user.section) && <p>Add your course and section when saving your profile so organizers have the details needed for your certificates. You can also continue to your dashboard or invitation below.</p>}
    <div className="form-grid"><Field label="Course" name="course" value={form.course} onChange={change} maxLength={120} placeholder="e.g. B.Tech Computer Science" /><YearSelect value={form.year} onChange={change} /></div>
    <div className="form-grid"><Field label="Specialization (optional)" name="specialization" value={form.specialization} onChange={change} maxLength={120} placeholder="e.g. Artificial Intelligence" hint="Leave blank if not applicable." /><Field label="Section" name="section" value={form.section} onChange={change} maxLength={40} placeholder="e.g. Section A" /></div>
    <Notice>{error}</Notice><Notice success>{message}</Notice><div className="button-row"><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button><Link className="text-link" to={back}>Continue →</Link></div>
  </form></section><section className="portal-card"><h2>Change password</h2><p>You will need to log in again after changing your password.</p><form className="portal-form" onSubmit={async e => {
          e.preventDefault();
          setError('');
          if (passwords.newPassword !== passwords.confirm) {
            setError('New passwords do not match.');
            return;
          }
          setBusy(true);
          try {
            await api('/profile/password', {
              method: 'POST',
              body: {
                currentPassword: passwords.currentPassword,
                newPassword: passwords.newPassword
              }
            });
            await logout();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}>
    <Field label="Current password" type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={e => setPasswords({
            ...passwords,
            currentPassword: e.target.value
          })} required />
    <Field label="New password" type="password" autoComplete="new-password" value={passwords.newPassword} onChange={e => setPasswords({
            ...passwords,
            newPassword: e.target.value
          })} required minLength={8} maxLength={128} />
    <Field label="Confirm new password" type="password" autoComplete="new-password" value={passwords.confirm} onChange={e => setPasswords({
            ...passwords,
            confirm: e.target.value
          })} required minLength={8} maxLength={128} />
    <button className="secondary-button" disabled={busy}>Update password & log out</button>
  </form></section></div></div>;
}
