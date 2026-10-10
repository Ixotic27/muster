import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import Home from './pages/Home';
import Events from './pages/Events';
import EventDetail from './pages/EventDetail';
import RegisterPage from './pages/RegisterPage';
import AuthPage from './pages/AuthPage';
import Schedule from './pages/Schedule';
import AboutPage from './pages/AboutPage';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import RegisterPayment from './pages/RegisterPayment';
import MyPasses from './pages/MyPasses';
import ProfileSetup from './pages/ProfileSetup';
import InvitationPage from './pages/InvitationPage';
const StaffActivation = lazy(() => import('./pages/StaffActivation'));
const ChangeTemporaryPassword = lazy(() => import('./pages/ChangeTemporaryPassword'));
const Scanner = lazy(() => import('./pages/Scanner'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const EventManager = lazy(() => import('./pages/EventManager'));
import { Navigate, Link } from 'react-router-dom';
export default function App() {
  return <BrowserRouter><AuthProvider>
      <div className="app-shell">
        <Navbar />
        <main className="page-content">
          <Suspense fallback={<div className="portal" role="status">Loading…</div>}><Routes>
            <Route path="/" element={<Home />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:slug" element={<EventDetail />} />
            <Route path="/events/:slug/register" element={<ProtectedRoute><RegisterPage /></ProtectedRoute>} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/signup" element={<Navigate to="/auth?mode=signup" replace />} />
            <Route path="/login" element={<Navigate to="/auth" replace />} />
            <Route path="/forgot-password" element={<AuthPage initialMode="forgot" />} />
            <Route path="/reset-password" element={<AuthPage initialMode="reset" />} />
            <Route path="/staff-activation" element={<StaffActivation />} />
            <Route path="/change-password" element={<ProtectedRoute allowPasswordChange><ChangeTemporaryPassword /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/invitations/:id" element={<InvitationPage />} />
            <Route path="/dashboard/invites" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard/passes" element={<ProtectedRoute><MyPasses /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
            <Route path="/registrations/:id" element={<ProtectedRoute><RegisterPayment /></ProtectedRoute>} />
            <Route path="/scanner" element={<ProtectedRoute roles={['organizer', 'admin', 'super_admin']}><Scanner /></ProtectedRoute>} />
            <Route path="/admin/*" element={<ProtectedRoute roles={['admin', 'super_admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/manager" element={<ProtectedRoute roles={['organizer', 'admin', 'super_admin']}><EventManager /></ProtectedRoute>} />
            <Route path="/event-manager" element={<Navigate to="/manager" replace />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<div className="portal"><h1>Page not found</h1><p>That page may have moved.</p><Link className="primary-button" to="/events">Explore events</Link></div>} />
          </Routes></Suspense>
        </main>
        <Footer />
      </div>
    </AuthProvider></BrowserRouter>;
}
