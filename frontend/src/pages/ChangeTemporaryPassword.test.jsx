/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ChangeTemporaryPassword from './ChangeTemporaryPassword';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
jest.mock('../utils/api', () => ({ api: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
let container, root, setUser, logout;
const pending = { _id: 'staff', name: 'Staff Member', email: 'staff@example.test', mustChangePassword: true };
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks();
  setUser = jest.fn(); logout = jest.fn().mockResolvedValue(); useAuth.mockReturnValue({ user: pending, setUser, logout });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(entry = '/change-password?next=%2Fadmin') {
  await act(async () => root.render(<MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/change-password" element={<ChangeTemporaryPassword />} />
    <Route path="/manager" element={<p>Manager destination</p>} /><Route path="/admin" element={<p>Admin destination</p>} />
    <Route path="/auth" element={<p>Normal login</p>} /><Route path="/forgot-password" element={<p>Password recovery</p>} />
  </Routes></MemoryRouter>));
}
async function fill(password = 'PrivateStaff!232', confirm = password) {
  for (const [name, value] of Object.entries({ newPassword: password, confirm })) await act(async () => Simulate.change(container.querySelector(`[name="${name}"]`), { target: { name, value } }));
}
async function submit() { await act(async () => Simulate.submit(container.querySelector('form'))); }
test('chooses password using restricted session and replaces context with normal account before continuing', async () => {
  const normal = { ...pending, role: 'admin', mustChangePassword: false }; api.mockResolvedValue({ user: normal });
  await render(); expect(container.textContent).toContain(pending.email); await fill(); await submit();
  expect(api).toHaveBeenCalledWith('/auth/change-temporary-password', { method: 'POST', body: { newPassword: 'PrivateStaff!232' } });
  expect(setUser).toHaveBeenCalledWith(normal); expect(container.textContent).toContain('Admin destination');
  expect(window.location.href).not.toContain('PrivateStaff');
});
test.each(['short', 'x'.repeat(129)])('rejects invalid password length before requesting change', async password => {
  await render(); await fill(password); await submit(); expect(api).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]').textContent).toContain('8 and 128');
});
test('rejects password confirmation mismatch', async () => {
  await render(); await fill('PrivateStaff!232', 'DifferentPassword!232'); await submit(); expect(api).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]').textContent).toContain('do not match');
});
test('expired setup session clears typed credentials and offers recovery without reusing temporary password', async () => {
  api.mockRejectedValue(Object.assign(new Error('Your setup session has expired.'), { status: 401 }));
  await render(); await fill(); await submit(); expect(setUser).not.toHaveBeenCalled();
  expect(container.querySelector('[name="newPassword"]').value).toBe(''); expect(container.querySelector('button.primary-button').disabled).toBe(true);
  expect(container.textContent).toContain('temporary password has already been used'); expect(container.querySelector('a[href="/forgot-password"]')).not.toBeNull();
});
test('rejects incomplete server confirmation without opening staff tools', async () => {
  api.mockResolvedValue({ user: pending }); await render(); await fill(); await submit();
  expect(setUser).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]').textContent).toContain('could not be confirmed');
});
test('prevents duplicate submissions while request is pending', async () => {
  let finish; api.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(); await fill(); await submit(); await submit(); expect(api).toHaveBeenCalledTimes(1); expect([...container.querySelectorAll('input')].every(input => input.disabled)).toBe(true);
  await act(async () => finish({ user: { ...pending, mustChangePassword: false } }));
});
test.each(['https://evil.example', '//evil.example', '/\\evil.example', '/\n/evil.example', '/change-password', '/auth'])('unsafe or looping return destination %s falls back to manager', async next => {
  api.mockResolvedValue({ user: { ...pending, mustChangePassword: false } }); await render('/change-password?next=' + encodeURIComponent(next)); await fill(); await submit(); expect(container.textContent).toContain('Manager destination');
});
test('regular signed-in users do not see temporary-password form', async () => {
  useAuth.mockReturnValue({ user: { ...pending, mustChangePassword: false }, setUser, logout }); await render(); expect(container.textContent).toContain('Admin destination'); expect(api).not.toHaveBeenCalled();
});
test('signed-out users are sent to normal login', async () => {
  useAuth.mockReturnValue({ user: null, setUser, logout }); await render(); expect(container.textContent).toContain('Normal login');
});
test('signing out moves to password recovery', async () => {
  await render(); await act(async () => container.querySelector('button.secondary-button').click()); expect(logout).toHaveBeenCalledTimes(1); expect(container.textContent).toContain('Password recovery');
});
