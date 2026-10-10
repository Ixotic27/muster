/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ParticipantRoster from './ParticipantRoster';
import { api } from '../../utils/api';
import { downloadRoster } from '../../utils/rosterDownload';

jest.mock('../../utils/api', () => ({ api: jest.fn() }));
jest.mock('../../utils/rosterDownload', () => ({ downloadRoster: jest.fn() }));
let container, root;
const member = (name, id, matchesFilter, attended = false) => ({ userId: id, participant: { _id: id, name, email: id + '@example.com', studentId: id, course: 'BCA', section: 'Section A' }, leader: id === 'leader', registrationId: 'reg-' + id, regId: 'REF-' + id, registrationStatus: 'confirmed', paymentStatus: 'verified', paid: true, attended, matchesFilter });
const response = { groups: [{ _id: 'team', kind: 'team', teamName: 'Team Alpha', event: { name: 'Chess' }, status: 'locked', participantCount: 2, paidCount: 2, attendedCount: 1, attendance: 'partial', members: [member('Leader Name', 'leader', true, true), member('Teammate Name', 'teammate', false)] }], stats: { participants: { registered: 42, notPaid: 12, paid: 30, attended: 8 }, teams: { registered: 10, notPaid: 4, paid: 8, attended: 3 }, filtered: { participants: 1, groups: 1, teams: 1 } }, pagination: { total: 21, page: 1, pages: 2 } };
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); api.mockResolvedValue(response); downloadRoster.mockResolvedValue(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const show = async props => { await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ParticipantRoster endpoint="/admin/roster" eventId="event" query="Team Alpha" {...props} /></MemoryRouter>)); };

test('team first rows preserve full member details and explain individual attendance', async () => {
  await show();
  expect(container.querySelector('.roster-row summary strong').textContent).toBe('Team Alpha');
  expect(container.querySelector('.roster-row details').open).toBe(false);
  expect(container.querySelector('[aria-label="Participant totals"]').textContent).toContain('42');
  expect(container.textContent).toContain('Some participants attended');
  expect(container.querySelectorAll('.roster-member')).toHaveLength(2);
  expect(container.querySelector('[data-matches-filter="false"]').textContent).toContain('Outside current filter');
  expect(container.querySelector('[aria-label="Academic details for Teammate Name"]').textContent).toContain('Section A');
});

test('filter changes reset paging and downloads include the same event/search/filter without a page limit', async () => {
  await show();
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Next').click());
  expect(api.mock.calls.at(-1)[0]).toContain('page=2');
  await act(async () => container.querySelectorAll('.participant-counts button')[3].click());
  expect(api.mock.calls.at(-1)[0]).toBe('/admin/roster?filter=attended&q=Team+Alpha&eventId=event&page=1');
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent.includes('Download filtered')).click());
  expect(downloadRoster).toHaveBeenCalledWith('/admin/roster/export?filter=attended&q=Team+Alpha&eventId=event', 'muster-event-attended.csv');
});

test('failed download stays visible and can be retried', async () => {
  downloadRoster.mockRejectedValueOnce(new Error('Assignment changed. Refresh and try again.'));
  await show();
  const download = [...container.querySelectorAll('button')].find(button => button.textContent.includes('Download filtered'));
  await act(async () => download.click());
  expect(container.querySelector('[role="alert"]').textContent).toContain('Assignment changed');
  expect(download.disabled).toBe(false);
  await act(async () => download.click());
  expect(downloadRoster).toHaveBeenCalledTimes(2);
});

test('automatic refresh updates visible attendance without losing an expanded team and stops on unmount', async () => {
  jest.useFakeTimers();
  const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  try {
    await show(); const details = container.querySelector('.roster-row details'); details.open = true;
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(15000));
    expect(api).toHaveBeenCalledTimes(2); expect(container.querySelector('.roster-row details').open).toBe(true);
    visibility.mockReturnValue('hidden');
    await act(async () => jest.advanceTimersByTime(30000));
    expect(api).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('visible');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(api).toHaveBeenCalledTimes(3);
    await act(async () => root.render(<p>Roster closed</p>));
    await act(async () => jest.advanceTimersByTime(30000));
    expect(api).toHaveBeenCalledTimes(3);
  } finally { visibility.mockRestore(); jest.useRealTimers(); }
});
