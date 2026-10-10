/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { Link, MemoryRouter } from 'react-router-dom';
import Scanner from './Scanner';
import { api } from '../utils/api';
import { useResource } from '../components/common/Portal';
import { Html5Qrcode } from 'html5-qrcode';
jest.mock('../utils/api', () => ({
  api: jest.fn()
}));
jest.mock('../components/common/Operations', () => ({
  OperationsNav: () => null
}));
jest.mock('../components/common/Portal', () => ({
  ...jest.requireActual('../components/common/Portal'),
  useResource: jest.fn()
}));
jest.mock('html5-qrcode', () => ({
  Html5Qrcode: jest.fn()
}));
let container, root, mockDecode, reader, refresh;
const token = 'v1.payload.signature';
const submitToken = async text => {
  await act(async () => {
    Simulate.change(container.querySelector('textarea'), {
      target: {
        value: text
      }
    });
  });
  await act(async () => {
    Simulate.submit(container.querySelector('form'));
  });
};
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(global, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => 'test-scan-id'
    }
  });
  jest.clearAllMocks();
  global.createImageBitmap = jest.fn().mockResolvedValue({
    width: 480,
    height: 480,
    close: jest.fn()
  });
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: jest.fn(),
    imageSmoothingEnabled: true
  });
  jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['normalized'], {
    type: 'image/png'
  })));
  refresh = jest.fn().mockResolvedValue(undefined);
  useResource.mockImplementation(path => ({
    loading: false,
    error: '',
    refresh,
    data: path === '/events/manage/all' ? {
      events: [{
        _id: 'event-a',
        name: 'Test event',
        status: 'published',
        venue: 'Gate A'
      }]
    } : path ? {
      stats: {
        total: 2,
        checkedIn: 0,
        remaining: 2
      },
      recent: []
    } : null
  }));
  reader = {
    isScanning: false,
    start: jest.fn().mockImplementation(async (_device, _config, decode) => {
      mockDecode = decode;
      reader.isScanning = true;
    }),
    stop: jest.fn().mockImplementation(async () => {
      reader.isScanning = false;
    }),
    clear: jest.fn(),
    scanFile: jest.fn().mockResolvedValue(token)
  };
  Html5Qrcode.mockImplementation(() => reader);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/scanner?event=event-a']} future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }}><Link id="change-checkpoint" to="/scanner?event=event-b">Navigate to another checkpoint</Link><Scanner /></MemoryRouter>);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
  delete global.createImageBitmap;
});
test('rejects payment QR and website text without checking anyone in', async () => {
  await submitToken('upi://pay?pa=example@upi');
  expect(api).not.toHaveBeenCalled();
  expect(container.textContent).toContain('This is not an Muster entry pass');
});
test('manual entry submits the selected event and shows confirmed identity', async () => {
  api.mockResolvedValue({
    success: true,
    pass: {
      attendee: {
        name: 'Test Attendee',
        studentId: 'ID-1'
      },
      event: {
        name: 'Test event'
      }
    }
  });
  await submitToken(' ' + token + ' ');
  expect(api).toHaveBeenCalledWith('/scanner/verify', expect.objectContaining({
    body: {
      token,
      eventId: 'event-a',
      scanId: 'test-scan-id'
    }
  }));
  expect(container.textContent).toContain('Entry confirmed');
  expect(container.textContent).toContain('Test Attendee');
  expect(refresh).toHaveBeenCalled();
});
test('duplicate scan preserves prior entry identity and shows refusal', async () => {
  api.mockRejectedValue(Object.assign(new Error('Do not admit again'), {
    data: {
      code: 'ALREADY_CHECKED_IN',
      pass: {
        attendee: {
          name: 'Earlier Attendee'
        }
      }
    }
  }));
  await submitToken(token);
  expect(container.textContent).toContain('Already checked in');
  expect(container.textContent).toContain('Earlier Attendee');
});
test('a pass for a different event shows the backend refusal and never confirms entry', async () => {
  api.mockRejectedValue(Object.assign(new Error('This pass belongs to another event'), {
    data: {
      code: 'WRONG_EVENT'
    }
  }));
  await submitToken(token);
  expect(container.textContent).toContain('Entry not confirmed');
  expect(container.textContent).toContain('This pass belongs to another event');
  expect(container.textContent).not.toContain('Entry confirmed');
  expect(refresh).toHaveBeenCalled();
});
test('a late response cannot display success after navigation changes the checkpoint', async () => {
  let complete;
  api.mockImplementation(() => new Promise(resolve => {
    complete = resolve;
  }));
  await submitToken(token);
  await act(async () => container.querySelector('#change-checkpoint').click());
  await act(async () => complete({
    success: true,
    pass: {
      attendee: {
        name: 'Previous checkpoint attendee'
      }
    }
  }));
  expect(container.textContent).toContain('This event is unavailable or is not assigned to you');
  expect(container.textContent).not.toContain('Entry confirmed');
  expect(container.textContent).not.toContain('Previous checkpoint attendee');
  expect(refresh).not.toHaveBeenCalled();
});
test('camera duplicate callbacks send one request and stop the camera after decode', async () => {
  let complete;
  api.mockImplementation(() => new Promise(resolve => {
    complete = resolve;
  }));
  await act(async () => container.querySelector('button.primary-button').click());
  await act(async () => {
    mockDecode(token);
    mockDecode(token);
  });
  expect(api).toHaveBeenCalledTimes(1);
  expect(reader.stop).toHaveBeenCalledTimes(1);
  await act(async () => complete({
    success: true
  }));
});
test('cancelling camera startup waits for startup then stops and clears the reader', async () => {
  let startComplete;
  reader.start.mockImplementation(() => new Promise(resolve => {
    startComplete = () => {
      reader.isScanning = true;
      resolve();
    };
  }));
  await act(async () => container.querySelector('button.primary-button').click());
  expect(container.textContent).toContain('Cancel camera startup');
  await act(async () => container.querySelector('button.primary-button').click());
  await act(async () => startComplete());
  expect(reader.stop).toHaveBeenCalledTimes(1);
  expect(reader.clear).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Start camera');
  expect(api).not.toHaveBeenCalled();
});
test('denied camera access explains image fallback and leaves verification untouched', async () => {
  reader.start.mockRejectedValue(new Error('Permission denied'));
  await act(async () => container.querySelector('button.primary-button').click());
  expect(container.textContent).toContain('Camera unavailable');
  expect(container.textContent).toContain('Start camera');
  expect(reader.clear).toHaveBeenCalledTimes(1);
  expect(api).not.toHaveBeenCalled();
});
test('QR image decoding uses the same verification path', async () => {
  api.mockResolvedValue({
    success: true
  });
  const input = container.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', {
    value: [new File(['qr'], 'pass.png', {
      type: 'image/png'
    })]
  });
  await act(async () => {
    Simulate.change(input);
  });
  expect(reader.scanFile).toHaveBeenCalled();
  expect(api).toHaveBeenCalledTimes(1);
});
test('oversized image never reaches decoder or server', async () => {
  const input = container.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', {
    value: [{
      size: 11 * 1024 * 1024,
      type: 'image/png'
    }]
  });
  await act(async () => {
    Simulate.change(input);
  });
  expect(container.textContent).toContain('smaller than 10 MB');
  expect(Html5Qrcode).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalled();
});
test('unreadable QR image shows recovery instructions without calling verification', async () => {
  reader.scanFile.mockRejectedValue(new Error('No QR found'));
  const input = container.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', {
    value: [new File(['bad image'], 'pass.png', {
      type: 'image/png'
    })]
  });
  await act(async () => {
    Simulate.change(input);
  });
  expect(container.textContent).toContain('No readable QR found');
  expect(api).not.toHaveBeenCalled();
  expect(reader.clear).toHaveBeenCalled();
});
test('dense QR image retries a local unsmoothed reduction then verifies the unchanged decoded token once', async () => {
  reader.scanFile.mockRejectedValueOnce(new Error('Sampling failed')).mockResolvedValueOnce(token);
  api.mockResolvedValue({
    success: true
  });
  const input = container.querySelector('input[type=file]');
  const file = new File(['dense image'], 'pass.png', {
    type: 'image/png'
  });
  Object.defineProperty(input, 'files', {
    value: [file]
  });
  await act(async () => {
    Simulate.change(input);
  });
  expect(reader.scanFile).toHaveBeenCalledTimes(2);
  expect(reader.scanFile).toHaveBeenNthCalledWith(1, file, false);
  expect(reader.scanFile.mock.calls[1][0].type).toBe('image/png');
  const context = HTMLCanvasElement.prototype.getContext.mock.results[0].value;
  expect(context.imageSmoothingEnabled).toBe(false);
  expect(context.drawImage).toHaveBeenCalledWith(expect.objectContaining({
    width: 480,
    height: 480
  }), 0, 0, 240, 240);
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith('/scanner/verify', expect.objectContaining({
    body: {
      token,
      eventId: 'event-a',
      scanId: 'test-scan-id'
    }
  }));
  expect(container.textContent).toContain('Entry confirmed');
});
test('payment QR decoded during image retry still never reaches entry verification', async () => {
  reader.scanFile.mockRejectedValueOnce(new Error('Sampling failed')).mockResolvedValueOnce('upi://pay?pa=example@upi');
  const input = container.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', {
    value: [new File(['payment image'], 'payment.png', {
      type: 'image/png'
    })]
  });
  await act(async () => {
    Simulate.change(input);
  });
  expect(reader.scanFile).toHaveBeenCalledTimes(2);
  expect(api).not.toHaveBeenCalled();
  expect(container.textContent).toContain('This is not an Muster entry pass');
});