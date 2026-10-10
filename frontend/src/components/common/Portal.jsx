import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { api } from '../../utils/api';
import { site } from '../../config';
export const money = value => new Intl.NumberFormat(site.locale, {
  style: 'currency',
  currency: site.currency,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
}).format(value || 0);
export const date = value => value ? new Date(value).toLocaleString(site.locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: site.timeZone
}) + ' (' + site.timeZone + ')' : 'To be announced';
export const idOf = value => value?._id || value;
export function useResource(path) {
  const [snapshot, setSnapshot] = useState({
    path,
    data: null,
    error: '',
    loading: !!path
  });
  const current = useRef(path),
    sequence = useRef(0);
  current.current = path;
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!path) {
      setSnapshot({
        path,
        data: null,
        error: '',
        loading: false
      });
      return;
    }
    setSnapshot(previous => ({
      path,
      data: previous.path === path ? previous.data : null,
      error: '',
      loading: true
    }));
    try {
      const data = await api(path);
      if (request === sequence.current && current.current === path) setSnapshot({
        path,
        data,
        error: '',
        loading: false
      });
    } catch (e) {
      if (request === sequence.current && current.current === path) setSnapshot({
        path,
        data: null,
        error: e.message,
        loading: false
      });
    }
  }, [path]);
  useEffect(() => {
    refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  return {
    ...(snapshot.path === path ? snapshot : {
      data: null,
      error: '',
      loading: !!path
    }),
    refresh
  };
}
export function Notice({
  children,
  success = false
}) {
  return children ? <div className={`portal-notice ${success ? 'success' : ''}`} role={success ? 'status' : 'alert'}>{children}</div> : null;
}
export function Field({
  label,
  hint,
  children,
  ...props
}) {
  return <label className="portal-field"><span>{label}{props.required && <span aria-hidden="true"> *</span>}</span>{children || <input {...props} />}{hint && <small>{hint}</small>}</label>;
}
export function Status({
  value
}) {
  return <span className={`status-pill status-${value}`}>{String(value || 'pending').replaceAll('_', ' ')}</span>;
}
export function PageHead({
  kicker = 'Your event workspace',
  title,
  children,
  action
}) {
  return <header className="portal-head"><div><span className="eyebrow">{kicker}</span><h1>{title}</h1>{children && <p>{children}</p>}</div>{action}</header>;
}
export function Empty({
  title,
  children,
  to,
  label
}) {
  return <div className="portal-empty"><h2>{title}</h2><p>{children}</p>{to && <Link className="primary-button" to={to}>{label}</Link>}</div>;
}
export function LoadState({
  resource
}) {
  return resource.loading ? <p role="status" className="portal-loading">Loading…</p> : resource.error ? <><Notice>{resource.error}</Notice><button className="secondary-button" onClick={resource.refresh}>Try again</button></> : null;
}
export function Refresh({
  onClick
}) {
  return <button type="button" className="quiet-button" onClick={onClick}><RefreshCw size={16} /> Refresh</button>;
}
export function Pagination({
  value,
  onPage,
  busy
}) {
  if (!value) return null;
  return <div className="pagination"><span>{value.total} result{value.total === 1 ? '' : 's'} · Page {value.page} of {Math.max(1, value.pages)}</span><div className="button-row"><button className="quiet-button" disabled={busy || value.page <= 1} onClick={() => onPage(value.page - 1)}>Previous</button><button className="quiet-button" disabled={busy || value.page >= value.pages} onClick={() => onPage(value.page + 1)}>Next</button></div></div>;
}
export function Steps({
  current
}) {
  return <ol className="portal-steps">{['Your details', 'Team / solo', 'Payment', 'Entry pass'].map((name, i) => <li key={name} className={i <= current ? 'complete' : ''} aria-current={i === current ? 'step' : undefined}><span>{i + 1}</span>{name}</li>)}</ol>;
}
