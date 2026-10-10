/** @jest-environment jsdom */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import YearSelect from './YearSelect';

let container, root, change, submit;
function Form({ initial = '', disabled = false }) {
  const [value, setValue] = useState(initial);
  return <form onSubmit={submit}><YearSelect value={value} disabled={disabled} onChange={event => { change(event); setValue(event.target.value); }} /><input name="next" /><button type="submit">Save</button></form>;
}
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true; change = jest.fn(); submit = jest.fn(event => event.preventDefault());
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<Form />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const trigger = () => container.querySelector('[role="combobox"]');
const click = async node => { await act(async () => node.click()); };
const key = async value => { let event; await act(async () => { event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }); trigger().dispatchEvent(event); }); return event; };

test('year label names the control and keyboard selects fifth year without submitting', async () => {
  expect(document.getElementById(trigger().getAttribute('aria-labelledby')).textContent).toBe('Year (optional)');
  trigger().focus(); await key('ArrowDown'); await key('End');
  const active = document.getElementById(trigger().getAttribute('aria-activedescendant'));
  expect(active.textContent).toBe('5th year'); expect(active.classList.contains('is-active')).toBe(true);
  await key('Enter');
  expect(change).toHaveBeenCalledWith({ target: { name: 'year', value: '5' } });
  expect(trigger().textContent).toBe('5th year'); expect(document.activeElement).toBe(trigger());
  expect(new FormData(container.querySelector('form')).get('year')).toBe('5'); expect(submit).not.toHaveBeenCalled();
});

test('arrow navigation and Home clear an optional year through the same control', async () => {
  await key('ArrowDown'); await key('ArrowDown'); await key('ArrowDown'); await key('ArrowUp'); await key('Enter');
  expect(trigger().textContent).toBe('1st year');
  await key(' '); await key('Home'); await key('Enter');
  expect(trigger().textContent).toBe('Select year'); expect(new FormData(container.querySelector('form')).get('year')).toBe('');
});

test('Escape, Tab and outside pointer close without changing the year or trapping focus', async () => {
  await click(trigger()); await key('End'); await key('Escape'); expect(change).not.toHaveBeenCalled();
  await click(trigger()); const event = await key('Tab'); expect(event.defaultPrevented).toBe(false);
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  await click(trigger()); const outside = container.querySelector('[name="next"]');
  await act(async () => { outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); outside.focus(); });
  expect(container.querySelector('[role="listbox"]')).toBeNull(); expect(document.activeElement).toBe(outside); expect(change).not.toHaveBeenCalled();
});

test('touch choice near the bottom opens above and preserves native form data', async () => {
  trigger().getBoundingClientRect = () => ({ top: window.innerHeight - 80, bottom: window.innerHeight - 32 });
  await click(trigger());
  expect(container.querySelector('[role="listbox"]').classList.contains('opens-above')).toBe(true);
  const fifth = [...container.querySelectorAll('[role="option"]')].find(option => option.textContent === '5th year');
  await act(async () => { fifth.dispatchEvent(new Event('pointerdown', { bubbles: true })); fifth.click(); });
  expect(new FormData(container.querySelector('form')).get('year')).toBe('5'); expect(submit).not.toHaveBeenCalled();
});

test('an existing higher year is retained until the participant explicitly chooses a new one', async () => {
  await act(async () => root.render(<Form key="legacy" initial={7} />));
  expect(trigger().textContent).toBe('Year 7 (current)'); expect(new FormData(container.querySelector('form')).get('year')).toBe('7'); expect(change).not.toHaveBeenCalled();
  await click(trigger()); expect(container.querySelector('[role="option"][aria-selected="true"]').textContent).toBe('Year 7 (current)');
  const fifth = [...container.querySelectorAll('[role="option"]')].find(option => option.textContent === '5th year');
  await click(fifth); expect(new FormData(container.querySelector('form')).get('year')).toBe('5');
  await click(trigger()); expect(container.textContent).not.toContain('Year 7 (current)');
});

test('disabled selector cannot open or include its value in form submission', async () => {
  await act(async () => root.render(<Form disabled />)); await click(trigger());
  expect(container.querySelector('[role="listbox"]')).toBeNull(); expect(new FormData(container.querySelector('form')).has('year')).toBe(false);
});
