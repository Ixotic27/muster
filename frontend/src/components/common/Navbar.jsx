import 'react';
import { NavLink, Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { site } from '../../config';
export default function Navbar() {
  const {
    user,
    logout
  } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeMenu = () => setIsMenuOpen(false);
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 60);
    }
    window.addEventListener('scroll', onScroll, {
      passive: true
    });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <header className={`topbar ${scrolled ? 'scrolled' : ''} ${isMenuOpen ? 'menu-open' : ''}`}>
      <div className="brand-mark">
        <Link className="brand-link" to="/" onClick={closeMenu} aria-label={site.name + " home"}>
          <span className="brand-arrow" aria-hidden="true">↗</span>{site.name}<span className="demo-label">DEMO</span>
        </Link>
      </div>
      <button className="nav-toggle" type="button" aria-expanded={isMenuOpen} aria-controls="main-navigation" aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setIsMenuOpen(open => !open)}>
        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>
      <nav id="main-navigation" className="main-nav" aria-label="Main navigation">
        <NavLink to="/" end className={({
        isActive
      }) => isActive ? 'active' : ''} onClick={closeMenu}>Home</NavLink>
        <NavLink to="/events" className={({
        isActive
      }) => isActive ? 'active' : ''} onClick={closeMenu}>Events</NavLink>
        <NavLink to="/schedule" className={({
        isActive
      }) => isActive ? 'active' : ''} onClick={closeMenu}>Schedule</NavLink>
        <NavLink to="/about" className={({
        isActive
      }) => isActive ? 'active' : ''} onClick={closeMenu}>About</NavLink>
        {user ? <>
          {user.mustChangePassword ? <NavLink to="/change-password" onClick={closeMenu}>Set your password</NavLink> : <>
          <NavLink to="/dashboard" onClick={closeMenu}>Dashboard</NavLink>
          <NavLink to="/dashboard/passes" onClick={closeMenu}>My passes</NavLink>
          {['organizer', 'admin', 'super_admin'].includes(user.role) && <NavLink to="/scanner" onClick={closeMenu}>Scanner</NavLink>}
          {['organizer', 'admin', 'super_admin'].includes(user.role) && <NavLink to="/manager" onClick={closeMenu}>Event manager</NavLink>}
          {['admin', 'super_admin'].includes(user.role) && <NavLink to="/admin" onClick={closeMenu}>Admin</NavLink>}
          </>}
          <button className="nav-logout" onClick={async () => {
          try {
            await logout();
            closeMenu();
          } catch (e) {
            setLogoutError(e.message);
          }
        }}>Log out</button>
        </> : <Link className="nav-login" to="/auth" onClick={closeMenu}>Sign up / Login</Link>}
        {logoutError && <span role="alert">{logoutError}</span>}
      </nav>
    </header>;
}
