import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RegisterPage from './RegisterPage';
import { useAuth } from '../context/AuthContext';
import { useResource } from '../components/common/Portal';
import { api } from '../utils/api';
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../utils/api', () => ({ api: jest.fn() }));
jest.mock('../components/common/Portal', () => ({ ...jest.requireActual('../components/common/Portal'), useResource: jest.fn() }));
let root, container, event, teams;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  event = { _id: 'event-a', slug: 'workshop', name: 'Community workshop', status: 'published', eventDate: '2099-12-12T09:30:00Z', venue: 'Main hall', participationType: 'solo', minTeamSize: 1, maxTeamSize: 1, feeInr: 0 };
  teams = [];
  useAuth.mockReturnValue({ user: { _id: 'participant-a', name: 'Participant Example', email: 'participant@example.test' } });
  useResource.mockImplementation(path => ({ loading: false, error: '', refresh: jest.fn(), data: path === '/teams/mine' ? { teams } : path === '/registrations/mine' ? { registrations: [] } : { event } }));
  api.mockResolvedValue({ registration: { _id: 'registration-a' } });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = () => act(async () => root.render(<MemoryRouter initialEntries={['/events/workshop/register']}><Routes><Route path="/events/:slug/register" element={<RegisterPage />} /><Route path="/registrations/:id" element={<div>Registration destination</div>} /></Routes></MemoryRouter>));
const agree = () => act(async () => Simulate.change(container.querySelector('input[type="checkbox"]'), { target: { checked: true } }));
const submit = () => [...container.querySelectorAll('button')].find(button => /Confirm registration|Continue to payment/.test(button.textContent));

test('free registration requires consent and opens its saved registration without requesting a payment', async () => {
  await render();
  expect(container.textContent).toContain('No payment is required');
  expect(submit().disabled).toBe(true);
  await agree(); expect(submit().disabled).toBe(false);
  await act(async () => submit().click());
  expect(api).toHaveBeenCalledWith('/registrations', { method: 'POST', body: { eventId: 'event-a' } });
  expect(container.textContent).toContain('Registration destination');
});

test('paid registration explains verified payment without requiring manual proof for all methods', async () => {
  event.feeInr = 149;
  await render(); await agree();
  expect(submit().textContent).toContain('Continue to payment');
  expect(container.textContent).toContain('payment verification');
  expect(container.textContent).not.toContain('payment proof will be reviewed');
  expect(submit().disabled).toBe(false);
});

test('team entry is blocked until the leader has enough accepted members', async () => {
  event.participationType = 'team'; event.minTeamSize = 2; event.maxTeamSize = 4;
  teams = [{ _id: 'team-a', eventId: 'event-a', leaderId: 'participant-a', status: 'forming', teamName: 'Workshop team', joinCode: 'EVT-DEMO', members: [{ userId: 'participant-a', status: 'accepted', nameSnapshot: 'Participant Example' }] }];
  await render(); await agree(); expect(submit().disabled).toBe(true);
  teams[0].members.push({ userId: 'participant-b', status: 'accepted', nameSnapshot: 'Another Participant' });
  await render(); expect(submit().disabled).toBe(false);
  await act(async () => submit().click());
  expect(api).toHaveBeenCalledWith('/registrations', { method: 'POST', body: { eventId: 'event-a', teamId: 'team-a' } });
});

test('server-closed event remains blocked even when participant details are complete', async () => {
  event.availability = { open: false, message: 'Registration paused.' };
  await render(); await agree();
  expect(submit().disabled).toBe(true);
  expect(api).not.toHaveBeenCalled();
});
