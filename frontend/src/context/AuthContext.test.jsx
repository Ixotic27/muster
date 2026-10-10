/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthContext';
import { api } from '../utils/api';
jest.mock('../utils/api', () => ({ api: jest.fn() }));
let container, root, auth;
function Probe() { auth = useAuth(); return <p>{auth.loading ? 'loading' : auth.user?.mustChangePassword ? 'pending' : auth.user?.email || 'signed out'}{auth.error}</p>; }
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() { await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>)); }
test('restores restricted cookie session from me rejection without storing a bearer token', async () => {
  const user = { email: 'staff@example.test', mustChangePassword: true };
  api.mockRejectedValue(Object.assign(new Error('Choose password first'), { status: 403, data: { requiresPasswordChange: true, user } })); await render();
  expect(auth.user).toEqual(user); expect(auth.error).toBe(''); expect(auth.loading).toBe(false); expect(container.textContent).toBe('pending');
});
test('login marks restricted response pending even if server user flag is omitted and never stores response token', async () => {
  api.mockRejectedValueOnce(Object.assign(new Error('Not signed in'), { status: 401 })); await render();
  api.mockResolvedValueOnce({ requiresPasswordChange: true, token: 'restricted-secret', user: { email: 'staff@example.test' } });
  let user; await act(async () => { user = await auth.authenticate('login', { email: 'staff@example.test', password: 'Temporary!123' }); });
  expect(user).toEqual({ email: 'staff@example.test', mustChangePassword: true }); expect(auth.user.token).toBeUndefined(); expect(container.textContent).toBe('pending');
});
test('expired restricted cookie returns to signed-out state and ordinary accounts hydrate normally', async () => {
  api.mockRejectedValueOnce(Object.assign(new Error('Expired'), { status: 401 })); await render(); expect(auth.user).toBeNull(); expect(auth.error).toBe('');
  api.mockResolvedValueOnce({ user: { email: 'participant@example.test', role: 'participant' } }); await act(async () => auth.refresh()); expect(auth.user.role).toBe('participant');
});
