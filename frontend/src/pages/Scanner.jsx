import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, CameraOff, ScanLine, CheckCircle2, XCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../utils/api';
import { scanPassImage } from '../utils/scanPassImage';
import { OperationsNav } from '../components/common/Operations';
import { PageHead, Field, Notice, Empty, LoadState, useResource, date, Refresh } from '../components/common/Portal';
import { site } from '../config';
export default function Scanner() {
  const events = useResource('/events/manage/all'),
    [params, setParams] = useSearchParams(),
    eventId = params.get('event') || '';
  const [camera, setCamera] = useState(false),
    [cameraError, setCameraError] = useState(''),
    [manual, setManual] = useState(''),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [starting, setStarting] = useState(false);
  const stats = useResource(eventId ? '/scanner/stats/' + eventId : null);
  const inflight = useRef(false),
    decoding = useRef(false),
    callback = useRef(null),
    cameraQueue = useRef(Promise.resolve()),
    fileReader = useRef(null),
    mounted = useRef(true),
    checkpoint = useRef(eventId);
  checkpoint.current = eventId;
  const permitted = (events.data?.events || []).filter(e => ['published', 'closed'].includes(e.status)),
    selected = permitted.find(e => e._id === eventId);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      try {
        fileReader.current?.clear();
      } catch {}
    };
  }, []);
  useEffect(() => {
    setResult(null);
    setManual('');
    setCamera(false);
  }, [eventId]);
  async function verify(token) {
    if (inflight.current || !selected || !mounted.current) return;
    const verifyingEvent = eventId;
    inflight.current = true;
    setBusy(true);
    setResult(null);
    setCamera(false);
    setCameraError('');
    try {
      if (!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token.trim())) {
        setResult({
          success: false,
          code: 'INVALID_PASS',
          message: `This is not an ${site.name} entry pass. Payment QRs and website links cannot be used for entry.`
        });
        return;
      }
      const data = await api('/scanner/verify', {
        method: 'POST',
        body: {
          token: token.trim(),
          eventId,
          scanId: crypto.randomUUID()
        }
      });
      if (mounted.current && checkpoint.current === verifyingEvent) {
        setResult(data);
        setManual('');
        await stats.refresh();
      }
    } catch (e) {
      if (mounted.current && checkpoint.current === verifyingEvent) {
        setResult({
          success: false,
          ...e.data,
          message: e.message
        });
        await stats.refresh();
      }
    } finally {
      inflight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  callback.current = verify;
  useEffect(() => {
    if (!camera || !selected) return;
    let disposed = false,
      reader;
    setStarting(true);
    cameraQueue.current = cameraQueue.current.catch(() => {}).then(async () => {
      if (disposed) return;
      try {
        reader = new Html5Qrcode('entry-camera');
        await reader.start({
          facingMode: 'environment'
        }, {
          fps: 6,
          qrbox: (w, h) => ({
            width: Math.max(50, Math.min(220, w - 32, h - 32)),
            height: Math.max(50, Math.min(220, w - 32, h - 32))
          }),
          aspectRatio: 1
        }, text => {
          if (!disposed) callback.current(text);
        }, () => {});
      } catch {
        if (!disposed) {
          setCameraError('Camera unavailable. Allow camera access over HTTPS, or use a downloaded QR image below.');
          setCamera(false);
        }
      } finally {
        if (!disposed) setStarting(false);
      }
    });
    return () => {
      disposed = true;
      cameraQueue.current = cameraQueue.current.catch(() => {}).then(async () => {
        if (reader?.isScanning) await reader.stop().catch(() => {});
        try {
          reader?.clear();
        } catch {}
      });
    };
    // The camera is bound to a single event until it stops.
  }, [camera, eventId, Boolean(selected)]);
  async function scanImage(e) {
    const input = e.currentTarget,
      file = input.files?.[0];
    if (!file || busy || inflight.current || decoding.current) return;
    const imageEvent = eventId;
    if (file.size > 10 * 1024 * 1024) {
      setCameraError('Choose an image smaller than 10 MB.');
      input.value = '';
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setCameraError('Choose a PNG, JPEG or WebP image of the entry pass.');
      input.value = '';
      return;
    }
    decoding.current = true;
    setBusy(true);
    setCameraError('');
    try {
      await cameraQueue.current;
      if (!mounted.current) return;
      fileReader.current ||= new Html5Qrcode('entry-file-reader');
      const text = await scanPassImage(fileReader.current, file);
      if (mounted.current && checkpoint.current === imageEvent) await verify(text);
    } catch {
      if (mounted.current && checkpoint.current === imageEvent) setCameraError('No readable QR found. Use the original entry QR image or paste its complete token.');
    } finally {
      decoding.current = false;
      try {
        fileReader.current?.clear();
      } catch {}
      if (mounted.current) setBusy(false);
      input.value = '';
    }
  }
  return <div className="portal operations"><OperationsNav /><PageHead kicker="Gate operations" title="Entry scanner">Choose the event and scan an attendee’s entry pass. A successful scan immediately records entry; match the name and student ID before admitting them.</PageHead><LoadState resource={events} />
    {!events.loading && events.data && !permitted.length ? <Empty title="No active checkpoints">An administrator must assign you a published event or an event closed for registration.</Empty> : <div className="portal-columns scanner-layout"><div className="portal-stack"><section className="portal-card"><Field label="Event checkpoint"><select required disabled={camera || busy} value={selected ? eventId : ''} onChange={e => {
              setParams(e.target.value ? {
                event: e.target.value
              } : {});
              setResult(null);
              setManual('');
              setCameraError('');
            }}><option value="">Choose your event</option>{permitted.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}</select></Field>{eventId && !selected && events.data && <Notice>This event is unavailable or is not assigned to you.</Notice>}{selected && <p className="muted">{selected.venue} · {date(selected.eventDate)}</p>}
    <div className="scanner-stage"><div id="entry-camera" />{!camera && <div className="scanner-placeholder"><ScanLine size={64} /><h2>Ready for the next attendee</h2><p>{selected ? 'Position the entry QR inside the camera frame.' : 'Choose a checkpoint to begin.'}</p></div>}</div><Notice>{cameraError}</Notice><button className="primary-button" disabled={!selected || busy} onClick={() => {
            setCameraError('');
            setResult(null);
            setStarting(!camera);
            setCamera(!camera);
          }}>{camera ? <CameraOff size={20} /> : <Camera size={20} />} {camera ? starting ? 'Cancel camera startup' : 'Stop camera' : 'Start camera'}</button><p className="muted">Camera scanning pauses after each result. Start it again when you are ready for the next attendee.</p></section>
    <section className="portal-card"><h2>Upload or paste a pass</h2><Field label="Upload entry QR image" type="file" accept="image/png,image/jpeg,image/webp" disabled={camera || busy || !selected} onChange={scanImage} hint="Decoded on this device. The image is not uploaded to the server." /><div id="entry-file-reader" /><details className="token-fallback"><summary>Paste the complete entry token</summary><form className="portal-form" onSubmit={e => {
              e.preventDefault();
              verify(manual);
            }}><Field label="Entry QR token"><textarea value={manual} onChange={e => setManual(e.target.value)} required maxLength={4000} rows={4} placeholder="v1.…" disabled={busy || camera} /></Field><button className="secondary-button" disabled={!selected || busy || camera}>Verify & check in</button></form></details></section></div>
    <aside className="portal-stack"><section className={'portal-card scan-result ' + (result ? result.success ? 'scan-success' : 'scan-failed' : '')} aria-live="polite">{busy ? <h2>Checking entry pass…</h2> : result ? <>{result.success ? <CheckCircle2 size={44} /> : <XCircle size={44} />}<h2>{result.success ? 'Entry confirmed' : result.code === 'ALREADY_CHECKED_IN' ? 'Already checked in' : 'Entry not confirmed'}</h2><p>{result.message}</p>{result.pass && <dl className="summary-list"><div><dt>Attendee</dt><dd>{result.pass.attendee?.name}</dd></div><div><dt>Student ID</dt><dd>{result.pass.attendee?.studentId || 'Ask for photo ID'}</dd></div><div><dt>Event</dt><dd>{result.pass.event?.name}</dd></div><div><dt>Entry time</dt><dd>{date(result.pass.checkedInAt)}</dd></div></dl>}{result.scannedBy?.name && <p>Recorded by {result.scannedBy.name}</p>}</> : <><ScanLine size={40} /><h2>Awaiting a pass</h2><p>A green result confirms entry. Duplicate, expired, cancelled and wrong-event passes are refused.</p></>}</section>
    <section className="portal-card"><div className="section-heading"><h2>Checkpoint totals</h2>{selected && <Refresh onClick={stats.refresh} />}</div>{selected ? <><LoadState resource={stats} />{stats.data && <><div className="checkpoint-numbers">{[['total', 'Issued'], ['checkedIn', 'Entered'], ['remaining', 'Remaining']].map(([key, label]) => <div key={key}><strong>{stats.data.stats[key]}</strong><span>{label}</span></div>)}</div><h3>Recent entries</h3>{!stats.data.recent.length ? <p>No entries recorded yet.</p> : stats.data.recent.map(p => <div className="list-row" key={p._id}><div><strong>{p.userId?.name}</strong><small>{p.userId?.studentId}</small><small>{date(p.checkedInAt)} · {p.scannedBy?.name}</small></div></div>)}</>}</> : <p>Select an event to see its entry totals.</p>}</section></aside></div>}
  </div>;
}
