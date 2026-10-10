import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ScanLine } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
export function OperationsNav() {
  const {
    user
  } = useAuth();
  return <nav className="operations-nav" aria-label="Staff workspaces">
    {['admin', 'super_admin'].includes(user.role) && <NavLink to="/admin"><LayoutDashboard size={18} />Administration</NavLink>}
    <NavLink to="/manager"><CalendarDays size={18} />Event manager</NavLink>
    <NavLink to="/scanner"><ScanLine size={18} />Entry scanner</NavLink>
    <span className="staff-role">{user.role.replaceAll('_', ' ')}</span>
  </nav>;
}
export function ReviewDialog({
  title,
  busy,
  onClose,
  children
}) {
  const ref = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    if (ref.current && !ref.current.open) ref.current.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return <dialog className="review-dialog portal-card" ref={ref} onCancel={e => {
    e.preventDefault();
    if (!busy) close.current();
  }}>
    <div className="section-heading"><h2>{title}</h2><button type="button" autoFocus className="quiet-button" disabled={busy} onClick={onClose}>Close ×</button></div>{children}
  </dialog>;
}
