import 'react';
import { Link } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHead, Status, Empty, LoadState, useResource, date, Refresh } from '../components/common/Portal';
import { site } from '../config';
export default function MyPasses() {
  const resource = useResource('/passes/mine'),
    {
      user
    } = useAuth(),
    passes = resource.data?.passes || [];
  return <div className="portal"><PageHead kicker={`Your ticket to ${site.name}`} title="My entry passes" action={<Refresh onClick={resource.refresh} />}>Your personal QR appears once your registration is confirmed and any required NOC is approved. Keep it private and bring your photo ID.</PageHead><LoadState resource={resource} />
    {resource.data && (!passes.length ? <Empty title="No entry passes yet." to="/dashboard" label="Track my registration">Complete any payment and NOC requirements. Once approved, your entry QR will appear here.</Empty> : <div className="passes-grid">{passes.map(pass => <article className="entry-pass" key={pass._id}><header><span>{site.name}</span><Status value={pass.status === 'revoked' ? 'revoked' : pass.checkInStatus === 'checked_in' ? 'checked_in' : 'issued'} /></header><div className="pass-body"><span className="eyebrow">Admit one · {user.name}</span><h2>{pass.eventId?.name}</h2><p>{date(pass.eventId?.eventDate)}<br />{pass.eventId?.venue}</p><div className="qr-frame"><img src={pass.qrDataUrl} alt={'Entry QR for ' + pass.eventId?.name + ', pass ' + pass.passId} /></div><strong className="pass-reference">{pass.passId}</strong><p className="muted">One successful check-in per pass. Staff will scan this QR at the event entrance.</p>{pass.checkedInAt && <p>Checked in: {date(pass.checkedInAt)}</p>}<div className="button-row no-print"><a className="secondary-button" download={pass.passId + '.png'} href={pass.qrDataUrl}><Download size={17} /> Save QR</a><button className="quiet-button" onClick={() => window.print()}><Printer size={17} /> Print passes</button></div></div></article>)}</div>)}
    <p className="no-print"><Link className="text-link" to="/dashboard">← Back to dashboard</Link></p>
  </div>;
}
