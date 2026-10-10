import 'react';
import { Link, useParams } from 'react-router-dom';
import { useResource, LoadState, Notice, money, date } from '../components/common/Portal';
import { presentEvent, registrationAvailability } from '../utils/eventPresentation';
import SiteImage from '../components/common/SiteImage';
export default function EventDetail() {
  const {
    slug
  } = useParams();
  const resource = useResource('/events/' + encodeURIComponent(slug));
  if (!resource.data?.event) return <div className="portal"><h1>Event details</h1><LoadState resource={resource} /><Link className="text-link" to="/events">Browse all events</Link></div>;
  const event = presentEvent(resource.data.event);
  const unavailable = registrationAvailability(event);
  return <div className="event-detail-page">
      {event.image && <div className="detail-hero">
        <SiteImage src={event.image} alt={event.name} sizes="(max-width: 600px) 90vw, 520px" {...{
        width: 1200,
        height: 750
      }} />
      </div>}

      <div className="detail-card glass-panel">
        <div className="detail-header-row">
          <div>
            <span className="eyebrow">{event.categoryLabel}</span>
            <h1>{event.name}</h1>
          </div>
          {!unavailable && <Link to={`/events/${event.slug}/register`} className="primary-button">Register</Link>}
        </div>
        <Notice>{unavailable}</Notice>

        <div className="meta-grid">
          <div><strong>Date</strong><span>{date(event.eventDate)}</span></div>
          <div><strong>Venue</strong><span>{event.venue}</span></div>
          <div><strong>Team</strong><span>{event.teamSize}</span></div>
          <div><strong>Fee</strong><span>{money(event.feeInr)}{''}</span></div>
          <div><strong>Prize</strong><span>{event.prizePool || 'To be announced'}</span></div>
          <div><strong>Registration deadline</strong><span>{date(event.registrationDeadline || event.eventDate)}</span></div>
        </div>

        <section>
          <h2>About</h2>
          <p>{event.description}</p>
        </section>


        <section>
          <h2>Rules</h2>
          {event.rules.length ? <ul>
            {event.rules.map(rule => <li key={rule}>{rule}</li>)}
          </ul> : <p>The organizers will share the event rules before the event.</p>}
        </section>
      </div>
    </div>;
}
