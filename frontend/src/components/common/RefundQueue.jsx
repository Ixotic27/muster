import { useState } from 'react';
import { Field, Notice, Status, Empty, LoadState, useResource, money, date, Refresh, Pagination } from './Portal';
import { ReviewDialog } from './Operations';
import RefundReview from './RefundReview';
export default function RefundQueue({
  event
}) {
  const [status, setStatus] = useState('pending'),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [review, setReview] = useState(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const endpoint = '/events/manage/' + event._id + '/refunds';
  const resource = useResource(endpoint + '?' + new URLSearchParams({
    status,
    q: query,
    page
  }));
  const list = resource.data?.registrations || [];
  return <section className="portal-card" aria-label="Event refund requests"><div className="section-heading"><h2>Refund requests</h2><Refresh onClick={resource.refresh} /></div><p>Review requests for {event.name}. Refunds are transferred manually through your bank before completion is recorded.</p><Notice success>{message}</Notice><form className="operations-filters" onSubmit={e => {
      e.preventDefault();
      setPage(1);
      setQuery(search.trim());
    }}><Field label="Find a refund request" value={search} onChange={e => setSearch(e.target.value)} maxLength={120} placeholder="Name, team or registration reference" /><Field label="Refund review status"><select value={status} onChange={e => {
          setStatus(e.target.value);
          setPage(1);
        }}>{[['pending', 'Awaiting review'], ['completed', 'Completed'], ['rejected', 'Declined'], ['all', 'All requests']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><button className="secondary-button">Search refunds</button></form><LoadState resource={resource} />{resource.data && (!list.length ? <Empty title="No matching refund requests">Try another status or search. New requests will appear here.</Empty> : <div className="roster-list">{list.map(r => <article className="roster-row" key={r._id}><div><strong>{r.teamId?.teamName || r.leaderId?.name}</strong><small>{r.regId} · {r.leaderId?.email}</small><p>{r.refundReason}</p><small>{r.refundRequestedAt ? date(r.refundRequestedAt) : ''}</small></div><div><Status value={r.refundReviewStatus || 'pending'} /><p>{money(r.refundAmountInr ?? r.feeSnapshotInr)}</p><button className="quiet-button" onClick={() => {
            setReview(r);
            setMessage('');
          }}>{(r.refundReviewStatus || 'pending') === 'pending' ? 'Review refund' : 'View refund record'}</button></div></article>)}</div>)}<Pagination value={resource.data?.pagination} busy={resource.loading} onPage={setPage} />{review && <ReviewDialog title="Refund request" busy={busy} onClose={() => setReview(null)}><RefundReview item={review} endpoint={endpoint} onBusyChange={setBusy} onSaved={async text => {
        setReview(null);
        setMessage(text);
        await resource.refresh();
      }} /></ReviewDialog>}</section>;
}
