/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import StaffActivation from './StaffActivation';
import { api } from '../utils/api';
jest.mock('../utils/api', () => ({ api: jest.fn() }));
let container, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
test('old activation links explain the replacement and send users to normal login', async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/staff-activation?email=staff%40example.test&otp=12345678&password=Secret']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><StaffActivation /></MemoryRouter>));
  expect(container.textContent).toContain('stays valid until your first successful sign-in');
  expect(container.textContent).toContain('earlier activation codes have been replaced');
  expect(container.textContent).not.toContain('two hours');
  expect(container.textContent).not.toContain('Secret');
  expect(container.querySelector('form')).toBeNull();
  expect(container.querySelector('a.primary-button').getAttribute('href')).toBe('/auth?mode=login&next=%2Fmanager');
  expect(api).not.toHaveBeenCalled();
});
