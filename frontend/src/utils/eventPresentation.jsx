export const publicEvents = events => events;
export function presentEvent(event) {
  const range = event.minTeamSize === event.maxTeamSize ? String(event.maxTeamSize) : `${event.minTeamSize}–${event.maxTeamSize}`;
  return {
    ...event,
    description: event.description || 'The organizers will share more details soon.',
    rules: event.rules || [],
    categoryLabel: {
      technical: 'Technology',
      non_technical: 'Community & sport',
      esports: 'Gaming'
    }[event.category] || 'Event',
    image: event.bannerImage || '',
    accent: 'blue',
    teamSize: event.participationType === 'solo' ? 'Individual' : event.participationType === 'both' ? `Individual / ${range} members` : `${range} members`
  };
}
export function registrationAvailability(event, now = Date.now()) {
  if (event.availability?.open === false) return event.availability.message || 'This event is not accepting any more responses.';
  if (event.status !== 'published') return 'Registration is closed for this event.';
  if (new Date(event.eventDate).getTime() <= now) return 'This event has started. Registration is closed.';
  if (event.registrationDeadline && new Date(event.registrationDeadline).getTime() <= now) return 'The registration deadline has passed.';
  if (event.maxSlots && event.filledSlots >= event.maxSlots) return 'All registration slots are filled.';
  return '';
}
export function eventFormPayload(form, original = {}, initial = {}) {
  return Object.fromEntries(Object.entries(form).filter(([key, value]) => !original._id || value !== initial[key]).map(([key, value]) => {
    if (['minTeamSize', 'maxTeamSize', 'feeInr'].includes(key)) value = Number(value);
    if (key === 'maxSlots') value = value === '' ? null : Number(value);
    if (['eventDate', 'registrationDeadline'].includes(key)) value = value ? new Date(value).toISOString() : null;
    if (key === 'rules') value = value.split('\n').map(rule => rule.trim()).filter(Boolean);
    return [key, value];
  }));
}
