import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import GatewayCheckout from './GatewayCheckout';
import { api } from '../../utils/api';
jest.mock('../../utils/api', () => ({ api: jest.fn() }));
let container, root, options, checkout, confirmed;
const registration = { _id: 'registration-a', feeSnapshotInr: 100, eventId: { name: 'Community workshop' } };
const user = { name: 'Participant Example', email: 'participant@example.test' };
const response = { razorpay_order_id: 'order_demo', razorpay_payment_id: 'pay_demo', razorpay_signature: 'test-only-signature' };
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  confirmed = jest.fn().mockResolvedValue(undefined);
  checkout = { open: jest.fn(), on: jest.fn() };
  window.Razorpay = jest.fn().mockImplementation(value => { options = value; return checkout; });
  api.mockImplementation(path => path.endsWith('/orders') ? Promise.resolve({ keyId: 'rzp_test_example', order: { id: 'order_demo', amount: 10000, currency: 'INR' } }) : Promise.resolve({ message: 'Payment confirmed by server.' }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete window.Razorpay; });
const render = async (enabled = true) => act(async () => root.render(<GatewayCheckout registration={registration} user={user} onConfirmed={confirmed} enabled={enabled} testMode />));
const begin = async () => act(async () => container.querySelector('button').click());

test('checkout uses server-created order amount and sends only registration identity', async () => {
  await render(); await begin();
  expect(api).toHaveBeenCalledWith('/payments/gateway/orders', { method: 'POST', body: { registrationId: 'registration-a' } });
  expect(options).toMatchObject({ key: 'rzp_test_example', order_id: 'order_demo', amount: 10000, currency: 'INR' });
  expect(checkout.open).toHaveBeenCalledTimes(1);
  expect(confirmed).not.toHaveBeenCalled();
  expect(container.textContent).toContain('No real payment is collected');
});

test('success callback waits for server verification before refreshing registration', async () => {
  await render(); await begin();
  await act(async () => options.handler(response));
  expect(api).toHaveBeenLastCalledWith('/payments/gateway/verify', { method: 'POST', body: { registrationId: 'registration-a', ...response } });
  expect(confirmed).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Payment confirmed by server');
});

test('duplicate callbacks and dismiss during verification cannot create another checkout', async () => {
  let complete;
  api.mockImplementation(path => path.endsWith('/orders') ? Promise.resolve({ keyId: 'rzp_test_example', order: { id: 'order_demo', amount: 10000, currency: 'INR' } }) : new Promise(resolve => { complete = resolve; }));
  await render(); await begin();
  let pending;
  await act(async () => { pending = options.handler(response); await options.handler(response); options.modal.ondismiss(); });
  expect(api).toHaveBeenCalledTimes(2);
  expect(container.querySelector('button').disabled).toBe(true);
  await act(async () => { complete({ message: 'Confirmed' }); await pending; });
  expect(confirmed).toHaveBeenCalledTimes(1);
});

test('verification error gives recovery guidance without claiming success', async () => {
  await render(); await begin(); api.mockRejectedValue(new Error('Gateway confirmation pending.'));
  await act(async () => options.handler(response));
  expect(confirmed).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]').textContent).toContain('refresh your registration before paying again');
  expect(container.querySelector('button').disabled).toBe(false);
});

test('dismissal retains registration and disabled configuration exposes no payment button', async () => {
  await render(); await begin(); await act(async () => options.modal.ondismiss());
  expect(container.textContent).toContain('Your registration is still saved');
  expect(confirmed).not.toHaveBeenCalled();
  await render(false); expect(container.querySelector('button')).toBeNull();
});
