"""Generate editable draw.io diagrams and matching SVGs without external services."""
from pathlib import Path
import html
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parents[1] / 'docs' / 'diagrams'
OUT.mkdir(parents=True, exist_ok=True)
PALETTE = {'ink': '#14233b', 'muted': '#52627a', 'blue': '#2855d9', 'teal': '#087f78', 'purple': '#7951b0', 'amber': '#a6640c'}

def write_diagram(name, title, subtitle, nodes, edges, notes, width, height):
    mxfile = ET.Element('mxfile', host='app.diagrams.net', version='24.7.17')
    diagram = ET.SubElement(mxfile, 'diagram', name=title, id=name)
    model = ET.SubElement(diagram, 'mxGraphModel', dx=str(width), dy=str(height), grid='1', gridSize='10', page='1', pageWidth=str(width), pageHeight=str(height))
    root = ET.SubElement(model, 'root')
    ET.SubElement(root, 'mxCell', id='0')
    ET.SubElement(root, 'mxCell', id='1', parent='0')
    def text_cell(id_, value, x, y, w, h, size=16, bold=False):
        cell = ET.SubElement(root, 'mxCell', id=id_, value=value, vertex='1', parent='1', style=f'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontFamily=Arial;fontSize={size};fontColor={PALETTE["ink"]};fontStyle={1 if bold else 0};')
        ET.SubElement(cell, 'mxGeometry', x=str(x), y=str(y), width=str(w), height=str(h), attrib={'as':'geometry'})
    text_cell('title', title, 60, 30, width-120, 48, 32, True)
    text_cell('subtitle', subtitle, 60, 83, width-120, 55, 16)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">', f'<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(subtitle)}</desc>', '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8293ad"/></marker></defs>', f'<rect width="{width}" height="{height}" fill="#f4f7fb"/>', '<g font-family="Arial, sans-serif">', f'<text x="60" y="65" font-size="32" font-weight="700" fill="{PALETTE["ink"]}">{html.escape(title)}</text>', f'<text x="60" y="106" font-size="17" fill="{PALETTE["muted"]}">{html.escape(subtitle)}</text>']
    lookup = {n['id']:n for n in nodes}
    for i, edge in enumerate(edges):
        a,b = lookup[edge['a']], lookup[edge['b']]
        points = edge.get('points') or [(a['x']+a['w'],a['y']+a['h']/2),(b['x'],b['y']+b['h']/2)]
        path = 'M ' + ' L '.join(f'{x},{y}' for x,y in points)
        dashed = edge.get('dashed',False)
        svg.append(f'<path d="{path}" fill="none" stroke="#8293ad" stroke-width="2" {"stroke-dasharray=\"6 5\"" if dashed else ""} marker-end="url(#arrow)"/>')
        lx,ly = edge.get('labelAt', ((points[0][0]+points[-1][0])/2,(points[0][1]+points[-1][1])/2-9))
        label=html.escape(edge['label'])
        lw=max(70,len(edge['label'])*7.5)
        svg.append(f'<rect x="{lx-lw/2}" y="{ly-17}" width="{lw}" height="24" rx="5" fill="#f4f7fb"/><text x="{lx}" y="{ly}" text-anchor="middle" font-size="13" fill="#52627a">{label}</text>')
        cell=ET.SubElement(root,'mxCell', id=f'edge{i}', value=edge['label'], edge='1',parent='1',source=edge['a'],target=edge['b'],style=f'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#8293ad;endArrow=block;endFill=1;fontSize=13;fontColor=#52627a;labelBackgroundColor=#f4f7fb;dashed={1 if dashed else 0};')
        geo=ET.SubElement(cell,'mxGeometry',relative='1',attrib={'as':'geometry'})
        if len(points)>2:
            arr=ET.SubElement(geo,'Array',attrib={'as':'points'})
            for x,y in points[1:-1]: ET.SubElement(arr,'mxPoint',x=str(x),y=str(y))
    for n in nodes:
        color=PALETTE[n.get('color','blue')]
        body='<br/>'.join(html.escape(line) for line in n['lines'])
        value=f'<b>{html.escape(n["title"])}</b><br/><br/>{body}'
        cell=ET.SubElement(root,'mxCell',id=n['id'],value=value,vertex='1',parent='1',style=f'rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor={color};strokeWidth=2;arcSize=8;align=left;verticalAlign=top;spacing=20;fontFamily=Arial;fontSize=15;fontColor={PALETTE["ink"]};')
        ET.SubElement(cell,'mxGeometry',x=str(n['x']),y=str(n['y']),width=str(n['w']),height=str(n['h']),attrib={'as':'geometry'})
        x,y,w,h=n['x'],n['y'],n['w'],n['h']
        svg.extend([f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="white" stroke="{color}" stroke-width="2"/>',f'<rect x="{x+2}" y="{y+2}" width="{w-4}" height="49" rx="10" fill="{color}"/>',f'<rect x="{x+2}" y="{y+29}" width="{w-4}" height="22" fill="{color}"/>',f'<text x="{x+20}" y="{y+33}" font-size="19" font-weight="700" fill="white">{html.escape(n["title"])}</text>'])
        for k,line in enumerate(n['lines']): svg.append(f'<text x="{x+20}" y="{y+80+k*27}" font-size="15" fill="#14233b">{html.escape(line)}</text>')
    for i,(x,y,note) in enumerate(notes):
        text_cell(f'note{i}', note,x,y,width-x-60,45,15)
        svg.append(f'<text x="{x}" y="{y+24}" font-size="15" fill="#52627a">{html.escape(note)}</text>')
    svg.append('</g></svg>')
    ET.ElementTree(mxfile).write(OUT/f'{name}.drawio',encoding='utf-8',xml_declaration=True)
    (OUT/f'{name}.svg').write_text('\n'.join(svg),encoding='utf-8')

def box(id_,title,x,y,lines,color='blue',w=320,h=240):
    return dict(id=id_,title=title,x=x,y=y,w=w,h=h,lines=lines,color=color)

nodes=[
 box('user','User',60,170,['_id · PK','email · unique','name / optional profile','role / assignedEvents[]','passwordHash · hidden']),
 box('team','Team',500,170,['_id · PK','eventId / leaderId · refs','joinCode · unique','members[] · embedded','status / closedRoster[]']),
 box('invite','TeamInvite',940,170,['_id · PK','teamId / eventId · refs','invitedBy / invitedUser','invitedEmail / tokenHash','status / expiresAt']),
 box('audit','AdminAction',1380,170,['_id · PK','actorId · User ref','targetType / targetId','action / details','createdAt / requestId'],'purple'),
 box('event','Event',60,580,['_id · PK / slug · unique','name / date / venue','participation / team bounds','feeInr / capacity / deadline','status: draft → published']),
 box('registration','Registration',500,580,['_id · PK / regId · unique','eventId / leaderId / teamId','feeSnapshotInr / paymentId','status / document approval','refund review fields'],'teal'),
 box('payment','Payment',940,580,['_id · PK','registrationId / payerId','amountInr / currency','reference / provider','status / reviewedAt'],'teal'),
 box('order','GatewayOrder',1380,580,['_id · PK','registrationId / payerId','providerOrderId · unique','amountPaise / currency','provider payment / status'],'teal'),
 box('pass','Pass',60,990,['_id · PK / passId · unique','registrationId / userId','eventId / signed token','status / expiresAt','checkInStatus / scannedBy'],'purple'),
 box('notification','Notification',500,990,['_id · PK / userId · ref','type / title / message','registration/event/pass refs','readAt / emailStatus','dedupeKey'],'amber'),
 box('email','EmailJob',940,990,['_id · PK / dedupeKey · unique','recipient / notification refs','kind / rendered content','status / availableAt','attempts / lease / sentAt'],'amber'),
 box('support','Supporting collections',1380,990,['StoredFile · private uploads','AppConfig · event settings','EmailSender · daily budgets','WorkerLease · job exclusion','No live data in repository'],'purple')]
edges=[
 dict(a='user',b='team',label='1 → many'),dict(a='team',b='invite',label='1 → many'),
 dict(a='user',b='event',label='many ↔ many · staff',dashed=True,points=[(120,410),(120,580)],labelAt=(207,496)),
 dict(a='team',b='registration',label='1 → 0..1 per event',points=[(660,410),(660,580)],labelAt=(746,496)),
 dict(a='event',b='registration',label='1 → many'),dict(a='registration',b='payment',label='1 → many'),dict(a='payment',b='order',label='0..1 order',dashed=True),
 dict(a='event',b='pass',label='1 → many',points=[(135,820),(135,990)],labelAt=(195,908)),
 dict(a='registration',b='pass',label='1 → many · one per member',points=[(500,790),(420,790),(420,1060),(380,1060)],labelAt=(452,941)),
 dict(a='registration',b='notification',label='1 → many · lifecycle',points=[(660,820),(660,990)],labelAt=(748,908)),
 dict(a='notification',b='email',label='0..1 mail job'),
 dict(a='user',b='audit',label='staff actions',dashed=True,points=[(210,170),(210,144),(1540,144),(1540,170)],labelAt=(870,142))]
write_diagram('entity-relationship','EventFlow · Entity relationship diagram','MongoDB logical model • refs are application-enforced; embedded team members are not a separate collection.',nodes,edges,[(60,1270,'PK = primary identifier. Arrow labels describe logical cardinality; this diagram highlights the main workflow references.'),(60,1310,'Each accepted teammate receives a separate pass. Scan state belongs to that pass; payment belongs to the registration.'),(60,1350,'Refunds are review fields on Registration. Capacity and roster snapshots preserve historical decisions.')],1760,1410)

nodes=[
 box('browser','Participants & staff',60,190,['Browse / account / teams','Registration & checkout','My passes / staff scanner','Admin / event manager'],'blue',330,215),
 box('api','Express API',530,190,['Authentication + role scope','Event / team / registration','Gateway verification + refunds','Private files + signed passes'],'blue',400,215),
 box('db','MongoDB replica set',1110,190,['Users / events / teams','Registration / payment / passes','Notifications + durable outbox','Transactions + unique indexes'],'teal',350,215),
 box('checkout','Razorpay Checkout',60,610,['Hosted payment interface','Public key + server order','Browser callback is untrusted','No card data stored locally'],'teal',330,215),
 box('provider','Razorpay API & webhook',530,610,['Server creates amount/order','Verify capture + order + currency','Raw-body webhook signature','Idempotent local settlement'],'teal',400,215),
 box('worker','Email dispatcher / worker',1110,610,['Commit first → deliver second','Lease / retry / expiry / dedupe','Recheck recipient access','One job per lifecycle message'],'amber',350,215),
 box('mail','Configured SMTP provider',1110,1000,['TLS + verified sender domain','Responsive HTML + plain text','Receipt / pass / invite / reset','Delivery depends on provider'],'amber',350,210),
 box('scanner','Authorized event scanner',60,1000,['Camera / image / typed token','Validate signature & live status','Atomic first check-in wins','Event-scoped staff access'],'purple',330,210),
 box('operations','Operator configuration',530,1000,['Secrets only on backend','HTTPS / exact origins / backups','Worker scheduling + health','Manual refund evidence'],'purple',400,210)]
edges=[
 dict(a='browser',b='api',label='HTTPS · session'),dict(a='api',b='db',label='transactions'),
 dict(a='browser',b='checkout',label='public order + key',points=[(225,405),(225,610)],labelAt=(310,507)),
 dict(a='api',b='provider',label='create / fetch / verify',points=[(730,405),(730,610)],labelAt=(820,507)),
 dict(a='checkout',b='provider',label='capture payment'),
 dict(a='db',b='worker',label='durable EmailJob',points=[(1285,405),(1285,610)],labelAt=(1370,507)),
 dict(a='provider',b='api',label='signed webhook → API',points=[(930,690),(990,690),(990,470),(870,470),(870,405)],labelAt=(995,560)),
 dict(a='worker',b='mail',label='SMTP · accepted / retry',points=[(1285,825),(1285,1000)],labelAt=(1390,920)),
 dict(a='scanner',b='api',label='authenticated check-in',points=[(60,1090),(25,1090),(25,150),(650,150),(650,190)],labelAt=(444,142)),
 dict(a='operations',b='worker',label='independent scheduled retry',dashed=True,points=[(930,1090),(1010,1090),(1010,770),(1110,770)],labelAt=(999,937))]
write_diagram('system-design','EventFlow · High-level system design','Participant journey: account → team / solo registration → verified payment → personal pass → staff check-in.',nodes,edges,[(60,1260,'Payment settlement and email enqueue are transactional. A callback or webhook replay must not duplicate passes or mail.'),(60,1300,'Request-time mail delivery is best effort; a separately scheduled worker retries persisted jobs after failures.'),(60,1340,'Optional manual payment/document review remains available. No real payment credentials or participant data ship with this template.')],1520,1400)
print('Generated two editable .drawio files and two matching SVG diagrams.')
