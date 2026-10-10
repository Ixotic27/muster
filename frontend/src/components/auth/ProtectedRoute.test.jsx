/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../../context/AuthContext';
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
let container, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(path, allowPasswordChange = false, roles) {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path={path} element={<ProtectedRoute roles={roles} allowPasswordChange={allowPasswordChange}><p>Protected content</p></ProtectedRoute>} />
    {path !== '/change-password' && <Route path="/change-password" element={<p>Mandatory password choice</p>} />}
    <Route path="/auth" element={<p>Login destination</p>} />
  </Routes></MemoryRouter>));
}
test.each(['/admin', '/manager', '/scanner', '/dashboard', '/profile'])('pending staff cannot access protected page %s even if their role matches', async path => {
  useAuth.mockReturnValue({ user: { role: 'super_admin', mustChangePassword: true }, loading: false }); await render(path, false, path === '/admin' ? ['super_admin'] : undefined);
  expect(container.textContent).toBe('Mandatory password choice');
});
test('restricted staff can open only the password-change exception', async () => {
  useAuth.mockReturnValue({ user: { mustChangePassword: true }, loading: false }); await render('/change-password', true); expect(container.textContent).toBe('Protected content');
});
test('normal participant protections continue unchanged', async () => {
  useAuth.mockReturnValue({ user: { role: 'participant' }, loading: false }); await render('/dashboard'); expect(container.textContent).toBe('Protected content');
});
test('password-change exception still requires a signed-in session', async () => {
  useAuth.mockReturnValue({ user: null, loading: false }); await render('/change-password', true); expect(container.textContent).toBe('Login destination');
});
