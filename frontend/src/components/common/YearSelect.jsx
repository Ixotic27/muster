import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import '../../styles/collegeSelect.css';
import '../../styles/yearSelect.css';
const years = ['1st year', '2nd year', '3rd year', '4th year', '5th year'];

/** Optional academic year. Existing higher years remain intact until explicitly edited. */
export default function YearSelect({
  value = '',
  onChange,
  disabled = false
}) {
  const id = useId(),
    root = useRef(null),
    trigger = useRef(null),
    menu = useRef(null);
  const [open, setOpen] = useState(false),
    [above, setAbove] = useState(false),
    [active, setActive] = useState(0);
  const selected = value === null ? '' : String(value);
  const options = [{
    value: '',
    label: 'Select year'
  }, ...years.map((label, index) => ({
    value: String(index + 1),
    label
  }))];
  if (/^[6-8]$/.test(selected)) options.push({
    value: selected,
    label: `Year ${selected} (current)`
  });
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === selected));
  const labelId = id + '-label',
    listId = id + '-list';
  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({
      block: 'nearest'
    });
  }, [active, open]);
  function show(index = selectedIndex) {
    if (disabled) return;
    trigger.current?.focus({
      preventScroll: true
    });
    const bounds = trigger.current?.getBoundingClientRect();
    setAbove(Boolean(bounds && bounds.bottom + 270 > window.innerHeight && bounds.top > window.innerHeight - bounds.bottom));
    setActive(index);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    trigger.current?.focus({
      preventScroll: true
    });
  }
  function select(index) {
    onChange?.({
      target: {
        name: 'year',
        value: options[index].value
      }
    });
    close();
  }
  function keyDown(event) {
    if (disabled) return;
    const key = event.key;
    if (['Enter', ' ', 'Spacebar'].includes(key)) {
      event.preventDefault();
      if (open) select(active);else show();
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();else setActive(previous => Math.max(0, Math.min(options.length - 1, previous + (key === 'ArrowDown' ? 1 : -1))));
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      const index = key === 'Home' ? 0 : options.length - 1;
      if (!open) show(index);else setActive(index);
    } else if (key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (key === 'Tab') setOpen(false);
  }
  return <div ref={root} className={'portal-field college-select year-select' + (open ? ' is-open' : '')} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label id={labelId} htmlFor={id}>Year (optional)</label>
    <input type="hidden" name="year" value={selected} disabled={disabled} />
    <div className="college-select-control">
      <button ref={trigger} id={id} type="button" className="college-select-trigger" role="combobox" aria-labelledby={labelId} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${id}-option-${active}` : undefined} disabled={disabled} onKeyDown={keyDown} onClick={() => {
        if (open) setOpen(false);else show();
      }}>
        <span>{options[selectedIndex].label}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && <ul ref={menu} id={listId} role="listbox" aria-labelledby={labelId} className={'college-select-menu' + (above ? ' opens-above' : '')}>
        {options.map((option, index) => <li role="presentation" key={option.value}><button id={`${id}-option-${index}`} data-index={index} type="button" role="option" aria-selected={selected === option.value} tabIndex={-1} className={'college-select-option' + (index === active ? ' is-active' : '')} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => select(index)}><span>{option.label}</span>{selected === option.value && <Check size={18} aria-hidden="true" />}</button></li>)}
      </ul>}
    </div>
  </div>;
}
