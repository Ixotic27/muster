import { downloadRoster } from './rosterDownload';

const originalFetch = global.fetch;
beforeEach(() => { global.fetch = jest.fn(); URL.createObjectURL = jest.fn(() => 'blob:participants'); URL.revokeObjectURL = jest.fn(); jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); jest.useFakeTimers(); });
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); jest.restoreAllMocks(); global.fetch = originalFetch; });

test('authenticated CSV downloads preserve blob contents and clean up temporary URLs', async () => {
  const blob = new Blob(['Name\r\n"Participant"'], { type: 'text/csv' });
  global.fetch.mockResolvedValue({ ok: true, blob: async () => blob });
  await downloadRoster('/admin/roster/export?filter=paid', 'paid.csv');
  expect(global.fetch).toHaveBeenCalledWith('/api/v1/admin/roster/export?filter=paid', { credentials: 'include' });
  expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  expect(document.querySelector('a[download="paid.csv"]')).toBeNull();
  jest.runOnlyPendingTimers(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:participants');
});

test('authorization errors are shown without downloading an error response', async () => {
  global.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'This event is not assigned to your account' }) });
  await expect(downloadRoster('/events/manage/event/roster/export')).rejects.toThrow('not assigned');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test('network errors give a retryable download explanation', async () => {
  global.fetch.mockRejectedValue(new Error('Failed to fetch'));
  await expect(downloadRoster('/admin/roster/export')).rejects.toThrow('Check your connection');
});
