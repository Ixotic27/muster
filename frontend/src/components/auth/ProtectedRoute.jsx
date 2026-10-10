import 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Notice } from '../common/Portal';
export default function ProtectedRoute({
  children,
  roles,
  allowPasswordChange = false
}) {
  const {
    user,
    loading,
    error,
    refresh
  } = useAuth();
  const location = useLocation();
  if (loading) return <div className="portal" role="status">Checking your session…</div>;
  if (error) return <div className="portal"><Notice>{error}</Notice><button className="primary-button" onClick={refresh}>Retry connection</button></div>;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`} replace />;
  if (user.mustChangePassword && !allowPasswordChange) return <Navigate to={`/change-password?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`} replace />;
  if (roles && !roles.includes(user.role)) return <div className="portal"><h1>Staff access required</h1><p>This area is available to assigned event organizers and administrators. Your account is signed in as a participant.</p><Link to="/dashboard" className="primary-button">My dashboard</Link></div>;
  return children;
}
