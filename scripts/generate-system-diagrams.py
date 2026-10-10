"""Generate matching, editable C4-style context/container diagrams (stdlib only).

The system boundary expresses software ownership, not a particular cloud vendor.
Every connector uses explicit orthogonal waypoints and fixed, editable labels.
"""
from pathlib import Path
import html
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parents[1] / 'docs' / 'diagrams'
OUT.mkdir(parents=True, exist_ok=True)
INK, MUTED, BLUE, GREY, TEAL = '#142438', '#526174', '#25547c', '#5c6570', '#1e706a'


class Diagram:
    def __init__(self, name, title, subtitle, width, height):
        self.name, self.width, self.height = name, width, height
        self.file = ET.Element('mxfile', host='app.diagrams.net', version='24.7.17')
        d = ET.SubElement(self.file, 'diagram', id=name, name=title)
        model = ET.SubElement(d, 'mxGraphModel', grid='1', gridSize='10', page='1', pageWidth=str(width), pageHeight=str(height))
        self.root = ET.SubElement(model, 'root')
        ET.SubElement(self.root, 'mxCell', id='0')
        ET.SubElement(self.root, 'mxCell', id='1', parent='0')
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">', f'<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(subtitle)}</desc>', '<defs>']
        for name_, color in [('blue', BLUE), ('grey', GREY), ('teal', TEAL)]:
            self.svg.append(f'<marker id="{name_}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="{color}"/></marker>')
            self.svg.append(f'<marker id="{name_}-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 10 0 L 0 5 L 10 10 z" fill="{color}"/></marker>')
        self.svg.extend(['</defs>', '<rect width="100%" height="100%" fill="white"/>', '<g font-family="Arial, Helvetica, sans-serif">'])
        self.text('title', title, 60, 34, width-120, 40, 28, True)
        self.text('subtitle', subtitle, 60, 83, width-120, 35, 16)
        self.nodes = {}

    def cell(self, id_, value, style, x, y, w, h):
        cell = ET.SubElement(self.root, 'mxCell', id=id_, value=value, style=style, vertex='1', parent='1')
        ET.SubElement(cell, 'mxGeometry', x=str(x), y=str(y), width=str(w), height=str(h), attrib={'as': 'geometry'})
        return cell

    def text(self, id_, value, x, y, w, h, size=15, bold=False, color=MUTED, align='left', background=False):
        self.cell(id_, html.escape(value), f'text;html=1;strokeColor=none;fillColor={"#ffffff" if background else "none"};align={align};verticalAlign=middle;fontFamily=Arial;fontSize={size};fontColor={color};fontStyle={1 if bold else 0};whiteSpace=wrap;', x, y, w, h)
        if background:
            self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="white"/>')
        anchor = 'middle' if align == 'center' else 'start'
        tx = x+w/2 if align == 'center' else x
        self.svg.append(f'<text x="{tx}" y="{y+h/2+size*.34}" font-size="{size}" font-weight="{700 if bold else 400}" text-anchor="{anchor}" fill="{color}">{html.escape(value)}</text>')

    def boundary(self, id_, label, x, y, w, h):
        self.cell(id_, html.escape(label), f'rounded=0;html=1;fillColor=none;strokeColor=#748193;dashed=1;dashPattern=8 5;strokeWidth=1.5;align=left;verticalAlign=top;spacingTop=12;spacingLeft=15;fontFamily=Arial;fontSize=16;fontStyle=1;fontColor={INK};', x, y, w, h)
        self.svg.extend([f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#748193" stroke-width="1.5" stroke-dasharray="8 5"/>', f'<text x="{x+15}" y="{y+28}" font-size="16" font-weight="700" fill="{INK}">{html.escape(label)}</text>'])

    def node(self, id_, title, kind, lines, x, y, w, h, external=False, database=False):
        color = TEAL if database else GREY if external else BLUE
        fill = '#f1f6f8' if not external else '#f4f4f4'
        shape = 'shape=cylinder3;boundedLbl=1;size=20;' if database else 'rounded=0;'
        value = '<b>'+html.escape(title)+'</b><br/>'+html.escape(kind)+'<br/><br/>'+'<br/>'.join(html.escape(line) for line in lines)
        self.cell(id_, value, f'{shape}html=1;whiteSpace=wrap;fillColor={fill};strokeColor={color};strokeWidth=2;fontFamily=Arial;fontSize=16;fontColor={INK};align=center;verticalAlign=middle;spacing=15;', x, y, w, h)
        self.nodes[id_] = (x, y, w, h)
        if database:
            self.svg.extend([f'<path d="M {x},{y+18} C {x},{y-6} {x+w},{y-6} {x+w},{y+18} L {x+w},{y+h-18} C {x+w},{y+h+6} {x},{y+h+6} {x},{y+h-18} Z" fill="{fill}" stroke="{color}" stroke-width="2"/>', f'<path d="M {x},{y+18} C {x},{y+42} {x+w},{y+42} {x+w},{y+18}" fill="none" stroke="{color}" stroke-width="2"/>'])
        else:
            self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{color}" stroke-width="2"/>')
        top = y+48 if database else y+37
        self.svg.extend([f'<text x="{x+w/2}" y="{top}" text-anchor="middle" font-size="20" font-weight="700" fill="{INK}">{html.escape(title)}</text>', f'<text x="{x+w/2}" y="{top+26}" text-anchor="middle" font-size="14" fill="{MUTED}">{html.escape(kind)}</text>'])
        for i, line in enumerate(lines):
            self.svg.append(f'<text x="{x+w/2}" y="{top+66+i*27}" text-anchor="middle" font-size="15" fill="{INK}">{html.escape(line)}</text>')

    def person(self, id_, title, lines, x, y, w=180, h=230):
        self.nodes[id_] = (x, y, w, h)
        # Native UML actor is a conventional editable person symbol.
        # The invisible group-sized anchor preserves identical connector ports.
        self.cell(id_, '', 'rounded=0;html=1;strokeColor=none;fillColor=none;', x, y, w, h)
        self.cell(id_+'-symbol', '', f'shape=umlActor;html=1;strokeColor={INK};fillColor=none;', x+w/2-27, y, 54, 95)
        cx = x+w/2
        self.svg.extend([f'<circle cx="{cx}" cy="{y+17}" r="16" fill="white" stroke="{INK}" stroke-width="2"/>', f'<path d="M {cx},{y+33} L {cx},{y+70} M {cx-27},{y+46} L {cx+27},{y+46} M {cx},{y+70} L {cx-24},{y+99} M {cx},{y+70} L {cx+24},{y+99}" fill="none" stroke="{INK}" stroke-width="2"/>'])
        self.text(id_+'-name', title, x, y+105, w, 28, 17, True, INK, 'center')
        self.text(id_+'-type', '[Person]', x, y+134, w, 24, 14, False, MUTED, 'center')
        for i, line in enumerate(lines):
            self.text(id_+f'-body{i}', line, x, y+166+i*24, w, 24, 14, False, MUTED, 'center')

    def edge(self, id_, a, b, points, labels=(), dashed=False, db=False, two_way=False):
        color, marker = (TEAL, 'teal') if db else (GREY, 'grey') if dashed else (BLUE, 'blue')
        dash = ' stroke-dasharray="7 5"' if dashed else ''
        begin = f' marker-start="url(#{marker}-start)"' if two_way else ''
        path = 'M '+' L '.join(f'{x},{y}' for x, y in points)
        self.svg.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="2"{dash}{begin} marker-end="url(#{marker})"/>')
        ax, ay, aw, ah = self.nodes[a]
        bx, by, bw, bh = self.nodes[b]
        start, end = points[0], points[-1]
        style = f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor={color};strokeWidth=2;endArrow=block;endFill=1;startArrow={"block" if two_way else "none"};startFill=1;dashed={1 if dashed else 0};exitX={(start[0]-ax)/aw};exitY={(start[1]-ay)/ah};entryX={(end[0]-bx)/bw};entryY={(end[1]-by)/bh};exitPerimeter=0;entryPerimeter=0;'
        cell = ET.SubElement(self.root, 'mxCell', id=id_, edge='1', parent='1', source=a, target=b, style=style)
        geo = ET.SubElement(cell, 'mxGeometry', relative='1', attrib={'as':'geometry'})
        arr = ET.SubElement(geo, 'Array', attrib={'as':'points'})
        for x, y in points[1:-1]:
            ET.SubElement(arr, 'mxPoint', x=str(x), y=str(y))
        for i, (label, x, y, w) in enumerate(labels):
            self.text(id_+f'-label{i}', label, x, y, w, 25, 14, False, color, 'center', True)

    def save(self):
        self.svg.append('</g></svg>')
        (OUT/(self.name+'.svg')).write_text('\n'.join(self.svg), encoding='utf-8')
        ET.ElementTree(self.file).write(OUT/(self.name+'.drawio'), encoding='utf-8', xml_declaration=True)


def context():
    d = Diagram('system-context', 'Muster | System context (C4 · Level 1)', 'Reusable event-management backend. Participants and staff access it through the reference frontend or an adopter-built client.', 1710, 1040)
    d.person('participant', 'Participant', ['Creates or joins a team', 'Registers, pays, uses pass'], 40, 220, 200)
    d.person('staff', 'Event staff', ['Manager / scanner / admin', 'Reviews, monitors, checks in'], 40, 600, 200)
    d.node('system', 'Muster backend', '[Software system]', ['Accounts, events and team coordination', 'Registration and payment verification', 'Individual attendance passes and check-in', 'Staff APIs, exports and workflow email'], 450, 360, 540, 290)
    d.node('gateway', 'Razorpay', '[External software system]', ['Hosted checkout and payment API', 'Captured-payment status + signed events'], 1250, 150, 380, 195, True)
    d.node('identity', 'Google Identity', '[External system · optional]', ['Verified-email OAuth identity', 'Password login remains available'], 1250, 440, 380, 195, True)
    d.node('mail', 'SMTP provider', '[External software system]', ['Accepts transactional messages', 'Delivery / inbox placement is external'], 1250, 730, 380, 195, True)
    d.edge('browse', 'participant', 'system', [(240,325),(330,325),(330,425),(450,425)], [('Uses a client application',240,270,205)])
    d.edge('operate', 'staff', 'system', [(240,705),(330,705),(330,580),(450,580)], [('Uses role-scoped client',240,725,210)])
    d.edge('payment', 'system', 'gateway', [(990,415),(1100,415),(1100,240),(1250,240)], [('Creates / verifies payments · HTTPS',990,155,260)])
    d.edge('webhook', 'gateway', 'system', [(1250,295),(1160,295),(1160,470),(990,470)], [('Signed payment webhook',995,455,250)], True)
    d.edge('oauth', 'system', 'identity', [(990,530),(1250,530)], [('OAuth 2.0 · HTTPS',990,495,255)])
    d.edge('email', 'system', 'mail', [(990,595),(1100,595),(1100,825),(1250,825)], [('Workflow notifications · SMTP/TLS',990,860,275)], True)
    d.text('legend', 'Solid arrow: request / interaction     Dashed arrow: webhook or email delivery     Arrow direction: initiator → recipient',60,965,1590,30,14)
    d.save()


def containers():
    d = Diagram('system-design', 'Muster | Container architecture (C4 · Level 2)', 'Backend building blocks and integration boundaries. The included frontend is a replaceable demonstration and checking client.', 1930, 1500)
    d.boundary('owned', 'MUSTER BACKEND · logical ownership boundary', 790,150,1080,870)
    d.person('users', 'Participants / staff', ['Role-scoped workflows', 'Scanner is a staff UI'], 25,255,200)
    d.node('web', 'Reference frontend', '[Demo client · React 18 / Vite]', ['Replaceable API consumer', "Static bundle; runs in user's browser", 'Checks registration / staff workflows', 'Hosts Razorpay Checkout', 'Camera / image QR scanning'], 330,240,340,290)
    d.node('api', 'Application API', '[Container · Node.js / Express]', ['Single modular monolith', 'JWT cookie / bearer + live user check', 'Role and assigned-event authorization', 'Registration / payment / pass services', 'Signature + provider capture checks', 'Atomic settlement and first check-in', 'Outbox insertion + post-commit send'], 830,240,400,370)
    d.node('db', 'Application database', '[Container · MongoDB replica set]', ['Users, events, teams, registrations', 'Gateway orders, receipts, passes', 'Notifications, EmailJob outbox', 'Transactions and unique indexes', 'Leases / retries / audit records'], 1430,240,380,290,database=True)
    d.node('worker', 'Email worker', '[Container · Node.js process]', ['Polls durable EmailJob outbox', 'Leases, retry, deduplication', 'Rechecks current access / expiry', 'Shared email renderer + processor', 'Continuous poll or one-shot job'], 1430,720,380,250)
    d.node('oauth', 'Google Identity', '[External system · optional]', ['OAuth 2.0 · verified email', 'Signed state checked by API', 'Enabled only with configured keys'], 330,590,330,175,True)
    d.node('custom', 'Adopter-built client', '[Integration option · not shipped]', ['Custom web / mobile / staff client', 'Uses the same authenticated API', 'Backend rules remain authoritative'],330,815,340,175,True)
    d.node('razorpay', 'Razorpay', '[External system]', ['Hosted Checkout + payment API', 'Orders use server-owned amount', 'Raw-body signed webhook events', 'Test mode is the template default'], 830,1140,380,220,True)
    d.node('smtp', 'SMTP provider', '[External system]', ['SMTP over TLS / STARTTLS', 'Configured sender identity', 'HTML + plain text / QR attachment', 'Messages leave after commit'],1430,1140,380,220,True)
    d.edge('user-web','users','web',[(225,370),(330,370)],[('Uses',230,333,85)])
    d.edge('web-api','web','api',[(670,370),(830,370)],[('HTTPS /api/v1',675,308,150),('JWT cookie / bearer',675,336,150),('Socket.IO notifications',673,386,154)])
    d.edge('web-checkout','web','razorpay',[(330,470),(270,470),(270,1245),(830,1245)],[('Hosted Checkout / HTTPS',360,1160,350),('Public key + server-created order',335,1191,400)])
    d.edge('api-db','api','db',[(1230,370),(1430,370)],[('Mongoose / Mongo wire',1235,328,190),('Read / write / transaction',1235,388,190)],db=True,two_way=True)
    d.edge('worker-db','worker','db',[(1620,720),(1620,530)],[('Claim / update EmailJob',1465,578,310),('WorkerLease + delivery status',1450,609,340)],db=True,two_way=True)
    d.edge('worker-smtp','worker','smtp',[(1620,970),(1620,1140)],[('Background send / retry',1470,1058,310)],dashed=True)
    d.edge('api-smtp','api','smtp',[(1230,570),(1300,570),(1300,1245),(1430,1245)],[('Post-commit send attempt',1210,802,220),('(awaited, best effort)',1217,831,210)],dashed=True)
    d.edge('api-orders','api','razorpay',[(930,610),(930,1140)],[('Create order / fetch capture',805,738,250),('HTTPS + server credentials',805,767,250)])
    d.edge('payment-webhook','razorpay','api',[(1120,1140),(1120,610)],[('POST /payments/gateway/webhook',999,934,288),('HMAC(raw body) → API re-fetch',997,963,290)],dashed=True)
    d.edge('api-google','api','oauth',[(830,490),(740,490),(740,675),(660,675)],[('OAuth / HTTPS',668,585,140)])
    d.edge('custom-api','custom','api',[(670,900),(775,900),(775,560),(830,560)],[('REST /api/v1',680,911,105)])
    d.text('sharednote', 'API and worker share the queue processor. MongoDB stores the outbox; there is no separate message broker.',810,192,1030,25,13)
    d.text('legendtitle','Notation',60,1390,160,25,15,True,INK)
    d.text('legend','Blue solid: synchronous request · Teal solid: database I/O (both ways) · Grey dashed: payment webhook / email delivery',240,1390,1620,25,14)
    d.text('trust','Trust: browser payment callbacks do not settle a registration; the API verifies order, amount, currency, signature and capture.',60,1430,1800,25,14)
    d.text('deployment','Deployment: API runtime + worker/scheduler + MongoDB replica set. Host the reference frontend only when needed; no cloud vendor is required.',60,1463,1800,25,14)
    d.save()


if __name__ == '__main__':
    context()
    containers()
