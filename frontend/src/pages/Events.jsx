import 'react';
import { Link } from 'react-router-dom';
import { useResource, LoadState, Empty } from '../components/common/Portal';
import { presentEvent, publicEvents, registrationAvailability } from '../utils/eventPresentation';
import SiteImage from '../components/common/SiteImage';
export default function Events() {
  const resource = useResource('/events');
  const events = publicEvents(resource.data?.events || []).map(presentEvent);
  return <div className="events-page">
      <section className="events-hero">
        <div className="events-title-wrap">
          <h1>EVENTS</h1>
        </div>
      </section>

      <section className="events-grid-wrap">
        <LoadState resource={resource} />
        {!resource.loading && resource.data && !events.length && <Empty title="Events will be announced soon">Published events will appear here when registration opens.</Empty>}
        <div className="event-grid">
          {events.map(event => <article key={event._id} className={`event-card event-card-${event.slug} ${event.accent}`}>
              <div className="event-card-top">
                <span>{event.categoryLabel}</span>
              </div>
              <Link to={`/events/${event.slug}`} className="event-art-link" aria-label={`View ${event.name} details`}>
                {event.image ? <SiteImage src={event.image} alt={event.name} className="event-art" loading="lazy" sizes="(max-width: 600px) 90vw, (max-width: 900px) 45vw, 30vw" {...{
              width: 1200,
              height: 750
            }} /> : <div className="event-art event-art-placeholder" aria-hidden="true">{event.name}</div>}
              </Link>
              <div className="event-card-body">
                <h3>{event.name}</h3>
                <div className="event-card-meta">
                  <span className="event-meta-badge">{event.teamSize}</span>
                  {registrationAvailability(event) && <span className="event-meta-badge">Registration closed</span>}
                </div>
                <Link to={`/events/${event.slug}`} className="event-link">View Details →</Link>
              </div>
            </article>)}
        </div>
      </section>
    </div>;
}
