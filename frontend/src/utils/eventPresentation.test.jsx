import { eventFormPayload, presentEvent, publicEvents, registrationAvailability } from './eventPresentation';
import { money } from '../components/common/Portal';

test('description-only edits preserve stored timestamps by omitting unchanged fields', () => {
  const initial = { description: 'Before', eventDate: '2099-12-12T09:30', feeInr: 149 };
  const original = { _id: 'event', eventDate: '2099-12-12T04:00:27.321Z' };
  expect(eventFormPayload({ ...initial, description: 'After' }, original, initial)).toEqual({ description: 'After' });
  expect(eventFormPayload(initial, original, initial)).toEqual({});
});

test('device-local dates, cleared capacity and rules serialize without event-specific assumptions', () => {
  expect(eventFormPayload({ eventDate: '2099-12-12T09:30', maxSlots: '', rules: ' First rule \n\nSecond rule', feeInr: '149.5' })).toEqual({
    eventDate: new Date('2099-12-12T09:30').toISOString(), maxSlots: null, rules: ['First rule', 'Second rule'], feeInr: 149.5
  });
});

test('payment summaries preserve fractional rupees', () => {
  expect(money(149.5)).toBe('₹149.5');
  expect(money(149.25)).toBe('₹149.25');
  expect(money(149)).toBe('₹149');
});

test('organizer artwork and managed event facts stay authoritative', () => {
  expect(presentEvent({ name: 'Team workshop', category: 'technical', feeInr: 500, participationType: 'team', minTeamSize: 2, maxTeamSize: 4, bannerImage: 'https://example.com/workshop.webp' })).toMatchObject({
    name: 'Team workshop', feeInr: 500, teamSize: '2–4 members', image: 'https://example.com/workshop.webp', categoryLabel: 'Technology'
  });
  expect(presentEvent({ participationType: 'solo' }).image).toBe('');
  expect(presentEvent({ participationType: 'solo' }).teamSize).toBe('Individual');
  expect(presentEvent({ description: 'Organizer approved details' }).description).toBe('Organizer approved details');
});

test('the template does not hide events based on their name or slug', () => {
  const events = [{ slug: 'community-day' }, { slug: 'new-event' }];
  expect(publicEvents(events)).toEqual(events);
});

test.each([[{ status: 'closed' }, /closed/], [{ eventDate: '2099-10-01T00:00:00Z' }, /started/], [{ registrationDeadline: '2099-10-01T00:00:00Z' }, /deadline/], [{ maxSlots: 3, filledSlots: 3 }, /filled/]])('unavailable events cannot advertise registration: %j', (changes, message) => {
  expect(registrationAvailability({ status: 'published', eventDate: '2099-12-12T04:00:00Z', ...changes }, Date.parse('2099-10-02T00:00:00Z'))).toMatch(message);
});

test('server closure blocks public registration even when local deadline and capacity remain open', () => {
  expect(registrationAvailability({ status: 'published', eventDate: '2099-10-30T10:00:00Z', availability: { open: false, message: 'Registration paused by the organizer.' } })).toBe('Registration paused by the organizer.');
});

test('an older open response cannot advertise entry after the local deadline passes', () => {
  expect(registrationAvailability({ status: 'published', eventDate: '2099-10-30T10:00:00Z', registrationDeadline: '2099-10-29T10:00:00Z', availability: { open: true } }, Date.parse('2099-10-29T10:00:00Z'))).toContain('deadline');
});
