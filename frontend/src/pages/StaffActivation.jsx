import 'react';
import { Link } from 'react-router-dom';
import { PageHead } from '../components/common/Portal';
export default function StaffActivation() {
  return <div className="portal">
    <PageHead kicker="Organizing team" title="Set up your staff account">Sign in with your assigned email address and the temporary password from your latest staff email.</PageHead>
    <section className="portal-card">
      <h2>Your temporary password is ready to use</h2>
      <p>It stays valid until your first successful sign-in. You must then choose your own password before opening staff tools.</p>
      <p>The earlier activation codes have been replaced. Use the temporary password in your new email on the regular login page.</p>
      <Link className="primary-button" to="/auth?mode=login&next=%2Fmanager">Sign in with your temporary password →</Link>
      <p>After signing in, finish choosing your password within 15 minutes. If you close the session or it expires, use <Link className="text-link" to="/forgot-password">Forgot password</Link> to recover access.</p>
      <p>Your event assignments and staff permissions remain assigned by the organizers. Keep both your temporary password and your chosen password private.</p>
    </section>
  </div>;
}
