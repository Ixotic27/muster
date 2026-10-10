/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import RegistrationWithdrawal from './RegistrationWithdrawal';
import DeleteTeam from './DeleteTeam';
import RefundReview from './RefundReview';
import RefundQueue from './RefundQueue';
import { api } from '../../utils/api';
jest.mock('../../utils/api', () => ({ api: jest.fn() }));
let container, root, saved;
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; });
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); api.mockResolvedValue({}); saved = jest.fn(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = async component => act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{component}</MemoryRouter>));
const button = text => [...container.querySelectorAll('button')].find(b => b.textContent === text);
const click = async text => act(async () => button(text).click());
const change = async (input, value) => act(async () => Simulate.change(input, { target: { value, checked: value } }));
const registration = { _id: 'entry', teamId: 'team', status: 'pending_payment', feeSnapshotInr: 100, withdrawal: { allowed: true, action: 'cancel', cutoff: null } };

test('unpaid deletion needs explicit consent and sends the cancellation endpoint once', async () => {
  await render(<RegistrationWithdrawal registration={registration} owner onSaved={saved} />);
  await click('Delete team / registration');
  expect(button('Confirm deletion').disabled).toBe(true);
  expect(api).not.toHaveBeenCalled();
  await change(container.querySelector('dialog input:not([type="checkbox"])'), 'Cannot attend');
  await change(container.querySelector('dialog input[type="checkbox"]'), true);
  await click('Confirm deletion');
  expect(api).toHaveBeenCalledWith('/registrations/entry/cancel', { method: 'POST', body: { reason: 'Cannot attend' } });
  expect(saved).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="status"]').textContent).toContain('emails are queued');
});

test('paid request uses the refund endpoint, explains immediate pass revocation and keeps server cutoff', async () => {
  await render(<RegistrationWithdrawal registration={{ ...registration, status: 'confirmed', withdrawal: { allowed: true, action: 'request_refund', cutoff: '2099-10-28T03:30:00Z' } }} owner onSaved={saved} />);
  expect(container.textContent).toContain('revoked immediately');
  expect(container.textContent).toContain('Refund requests close');
  await click('Request refund');
  await change(container.querySelector('dialog input:not([type="checkbox"])'), 'Schedule conflict');
  await change(container.querySelector('dialog input[type="checkbox"]'), true);
  await click('Send refund request');
  expect(api).toHaveBeenCalledWith('/registrations/entry/refund-request', { method: 'POST', body: { reason: 'Schedule conflict' } });
});

test('withdrawal fails closed without server policy and hides actions from teammates', async () => {
  await render(<RegistrationWithdrawal registration={{ ...registration, withdrawal: undefined }} owner />);
  expect(button('Delete team / registration')).toBeUndefined();
  await render(<RegistrationWithdrawal registration={registration} owner={false} />);
  expect(button('Delete team / registration')).toBeUndefined();
  expect(container.textContent).toContain('Only the registration owner');
});

test('a concurrent cancellation error retains the dialog and does not claim success', async () => {
  api.mockRejectedValue(new Error('Payment was submitted. Refresh and request a refund.'));
  await render(<RegistrationWithdrawal registration={registration} owner onSaved={saved} />);
  await click('Delete team / registration');
  await change(container.querySelector('dialog input:not([type="checkbox"])'), 'Cannot attend');
  await change(container.querySelector('dialog input[type="checkbox"]'), true);
  await click('Confirm deletion');
  expect(container.querySelector('dialog [role="alert"]').textContent).toContain('Payment was submitted');
  expect(saved).not.toHaveBeenCalled();
});

test('completed and declined refunds show history without creating new actions', async () => {
  await render(<RegistrationWithdrawal registration={{ ...registration, status: 'refunded', withdrawal: { allowed: false }, refundReviewStatus: 'completed', refundedAt: '2026-10-04T03:00:00Z', refundReference: 'BANK-REFUND-44' }} owner />);
  expect(container.textContent).toContain('BANK-REFUND-44');
  expect(container.querySelectorAll('button')).toHaveLength(0);
  await render(<RegistrationWithdrawal registration={{ ...registration, status: 'cancelled', withdrawal: { allowed: false }, refundReviewStatus: 'rejected', refundRejectionReason: 'No matching transfer' }} owner />);
  expect(container.textContent).toContain('No matching transfer');
  expect(container.textContent).toContain('No funds were returned');
});

test('team deletion requires explicit confirmation', async () => {
  await render(<DeleteTeam team={{ _id: 'playing-team', teamName: 'Players' }} onSaved={saved} />);
  await click('Delete team');
  expect(container.textContent).toContain('This dissolves the unregistered team and closes its invitations');
  expect(button('Confirm team deletion').disabled).toBe(true);
  await change(container.querySelector('dialog input[type="checkbox"]'), true);
  await click('Confirm team deletion');
  expect(api).toHaveBeenCalledWith('/teams/playing-team', { method: 'DELETE' });
  expect(saved).toHaveBeenCalledTimes(1);
});

test('submitted-payment refund requires received-bank confirmation, refund reference and completed transfer', async () => {
  await render(<RefundReview item={{ _id: 'entry', status: 'refund_requested', refundReviewStatus: 'pending', feeSnapshotInr: 100, paymentId: { status: 'submitted', utr: 'ORIGINAL-UTR' } }} endpoint="/events/manage/event/refunds" onSaved={saved} />);
  expect(container.textContent).toContain('It does not transfer money');
  expect(button('Mark refund completed').disabled).toBe(true);
  await change(container.querySelector('input:not([type="checkbox"])'), 'REFUND-123');
  const checks = container.querySelectorAll('input[type="checkbox"]');
  await change(checks[1], true);
  expect(button('Mark refund completed').disabled).toBe(true);
  await change(checks[0], true);
  await act(async () => Simulate.submit(container.querySelector('form')));
  expect(api).toHaveBeenCalledWith('/events/manage/event/refunds/entry/approve', { method: 'POST', body: { confirmed: true, reference: 'REFUND-123', paymentReceivedConfirmed: true } });
});

test('reviewed refund history has no approve or reject actions', async () => {
  await render(<RefundReview item={{ _id: 'entry', status: 'refunded', refundReviewStatus: 'completed', refundReference: 'BANK-42' }} endpoint="/admin/refunds" onSaved={saved} />);
  expect(container.textContent).toContain('BANK-42');
  expect(container.querySelectorAll('form')).toHaveLength(0);
  expect(api).not.toHaveBeenCalled();
});

test('decline requires an explanation and records it without restoring entry', async () => {
  await render(<RefundReview item={{ _id: 'entry', status: 'refund_requested', paymentId: { status: 'verified' } }} endpoint="/admin/refunds" onSaved={saved} />);
  expect(button('Decline refund request').disabled).toBe(true);
  await change(container.querySelector('.rejection-form input'), 'Payment not received');
  await act(async () => Simulate.submit(container.querySelector('.rejection-form')));
  expect(api).toHaveBeenCalledWith('/admin/refunds/entry/reject', { method: 'POST', body: { reason: 'Payment not received' } });
  expect(saved.mock.calls[0][0]).toContain('entry stays cancelled');
});

test('event refund queue is scoped to the selected event and reloads filtered history', async () => {
  api.mockResolvedValue({ registrations: [], pagination: { page: 1, pages: 1, total: 0 } });
  await render(<RefundQueue event={{ _id: 'assigned', name: 'Chess' }} />);
  expect(api).toHaveBeenCalledWith('/events/manage/assigned/refunds?status=pending&q=&page=1');
  await change(container.querySelector('select'), 'completed');
  expect(api).toHaveBeenCalledWith('/events/manage/assigned/refunds?status=completed&q=&page=1');
  expect(container.textContent).toContain('No matching refund requests');
});
