import 'react';
import { Link } from 'react-router-dom';
import { site } from '../config';
export default function AboutPage() {
  return <div className="portal"><header className="editorial-head"><span className="eyebrow">About {site.name}</span><h1>Less administration.<br />More participation.</h1><p>A reusable platform for communities that bring people together.</p></header><div className="portal-columns equal"><section className="portal-card"><h2>One participant journey</h2><p>Create an account, discover an event, form a team when needed, and track your registration. Payment confirmation and entry-pass updates arrive by email when the organizer has configured delivery.</p><Link className="primary-button" to="/events">Explore events</Link></section><section className="portal-card"><h2>Clear event operations</h2><p>Assigned organizers review their events, see participant readiness and record attendance. Administrators manage access, registration capacity, payment reviews and refunds with an activity log.</p><p>Event fees, deadlines, venues and rules are set by each organizer. Please read the event page before registering.</p></section></div></div>;
}
