import 'react';
import { Link } from 'react-router-dom';
import { useResource, LoadState, Empty, date, PageHead } from '../components/common/Portal';
export default function Schedule() {
  const resource = useResource('/events'),
    events = [...(resource.data?.events || [])].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
  return <div className="portal"><PageHead kicker="Plan your day" title="Event schedule">Published event times appear here. All times follow the configured event timezone.</PageHead><LoadState resource={resource} />{resource.data && !events.length && <Empty title="The schedule is on its way">Check back when events are announced.</Empty>}<div className="schedule-list">{events.map(event => <Link className="schedule-row" key={event._id} to={'/events/' + event.slug}><span>{date(event.eventDate)}</span><div><h2>{event.name}</h2><p>{event.venue}</p></div><span aria-hidden="true">↗</span></Link>)}</div></div>;
}
