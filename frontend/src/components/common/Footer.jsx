import 'react';
import { Link } from 'react-router-dom';
import { site } from '../../config';
export default function Footer() {
  return <footer className="site-footer"><div className="footer-content"><div><Link className="footer-brand" to="/">{site.name}<span>↗</span></Link><p>{site.tagline}</p></div><nav aria-label="Footer navigation"><Link to="/events">Events</Link><Link to="/schedule">Schedule</Link><Link to="/about">About</Link>{site.supportEmail && <a href={'mailto:' + site.supportEmail}>Contact</a>}</nav></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {site.name}</span><span>Built for better event experiences.</span></div></footer>;
}
