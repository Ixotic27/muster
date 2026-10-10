"""Conventional crow's-foot logical views of the physical MongoDB schemas.

Python 3.10+; standard library only. Editable draw.io and matching SVG output.
"""
from pathlib import Path
import html
import math
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parents[1] / "docs" / "diagrams"
INK, MUTED, LINE = "#203044", "#556577", "#45566a"
MARKER = {"1": "ERmandOne", "0..1": "ERzeroToOne", "0..*": "ERzeroToMany", "1..*": "ERoneToMany"}


def entity(id_, name, collection, x, y, rows, width=430):
    return dict(id=id_, name=name, collection=collection, x=x, y=y,
                w=width, h=64+30*len(rows), rows=rows)


def relationship(a, b, start, end, points, label, label_at, embedded=False):
    return dict(a=a, b=b, start=start, end=end, points=points,
                label=label, label_at=label_at, embedded=embedded)


class Diagram:
    def __init__(self, name, title, subtitle, width, height):
        self.name, self.width = name, width
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title description">',
                    f'<title id="title">{html.escape(title)}</title>',
                    f'<desc id="description">{html.escape(subtitle)} Conventional crow’s-foot cardinalities, square entity tables, and undirected relationship lines.</desc>',
                    f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
                    '<g font-family="Arial, Helvetica, sans-serif" fill="#203044">']
        self.mxfile = ET.Element("mxfile", host="app.diagrams.net", version="24.7.17")
        diagram = ET.SubElement(self.mxfile, "diagram", name=title, id=name)
        model = ET.SubElement(diagram, "mxGraphModel", dx=str(width), dy=str(height),
                              grid="1", gridSize="10", page="1", pageWidth=str(width), pageHeight=str(height))
        self.root = ET.SubElement(model, "root")
        ET.SubElement(self.root, "mxCell", id="0")
        ET.SubElement(self.root, "mxCell", id="1", parent="0")
        self.counter = 0
        self.text(title, 60, 44, 34, bold=True)
        self.text(subtitle, 60, 93, 17, color=MUTED)
        self.line([(60,125),(width-60,125)], solid=True, color="#c8d2dd")

    def text(self, value, x, y, size=15, bold=False, color=INK, align="left", width=None):
        self.counter += 1
        anchor = {"left":"start", "center":"middle", "right":"end"}[align]
        self.svg.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{700 if bold else 400}" text-anchor="{anchor}" fill="{color}">{html.escape(value)}</text>')
        w = width or max(90, len(value)*size*0.6+20)
        cell = ET.SubElement(self.root, "mxCell", id=f"text{self.counter}", value=value, vertex="1", parent="1",
                             style=f"text;html=0;strokeColor=none;fillColor=none;align={align};verticalAlign=middle;fontFamily=Arial;fontSize={size};fontColor={color};fontStyle={1 if bold else 0};")
        xx = x if align=="left" else x-w/2 if align=="center" else x-w
        ET.SubElement(cell, "mxGeometry", x=str(xx), y=str(y-size-3), width=str(w), height=str(size+9), attrib={"as":"geometry"})

    def line(self, points, solid=False, color=LINE):
        path = "M " + " L ".join(f"{x},{y}" for x,y in points)
        dash = "" if solid else ' stroke-dasharray="7 5"'
        self.svg.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.7"{dash}/>')

    def endpoint(self, point, inward, cardinality):
        x,y = point
        dx,dy = inward
        norm = math.hypot(dx,dy)
        ux,uy = dx/norm,dy/norm
        vx,vy = -uy,ux
        def pos(distance, perpendicular=0):
            return (x+ux*distance+vx*perpendicular, y+uy*distance+vy*perpendicular)
        def bar(distance):
            self.line([pos(distance,-8),pos(distance,8)], solid=True)
        def circle(distance):
            cx,cy = pos(distance)
            self.svg.append(f'<circle cx="{cx}" cy="{cy}" r="5" stroke="{LINE}" stroke-width="1.7" fill="white"/>')
        if cardinality=="1":
            bar(7); bar(15)
        elif cardinality=="0..1":
            bar(7); circle(21)
        else:
            for perpendicular in (-8,0,8):
                self.line([pos(1,perpendicular),pos(15)], solid=True)
            circle(25) if cardinality=="0..*" else bar(25)

    def box(self, node):
        x,y,w,h = node["x"],node["y"],node["w"],node["h"]
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="white" stroke="{LINE}" stroke-width="1.6"/>')
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="64" fill="#eaf0f6" stroke="{LINE}" stroke-width="1.6"/>')
        self.svg.append(f'<text x="{x+14}" y="{y+26}" font-size="20" font-weight="700">{html.escape(node["name"])}</text>')
        self.svg.append(f'<text x="{x+14}" y="{y+49}" font-size="13" fill="{MUTED}">{html.escape(node["collection"])}</text>')
        parent = ET.SubElement(self.root,"mxCell",id=node["id"],value="",vertex="1",parent="1",
                               style=f"rounded=0;html=0;fillColor=#ffffff;strokeColor={LINE};strokeWidth=1.6;")
        ET.SubElement(parent,"mxGeometry",x=str(x),y=str(y),width=str(w),height=str(h),attrib={"as":"geometry"})
        header = ET.SubElement(self.root,"mxCell",id=f'{node["id"]}_header',
                               value=f'<b>{html.escape(node["name"])}</b><br/><font style="font-size:13px">{html.escape(node["collection"])}</font>',
                               vertex="1",parent=node["id"],
                               style=f"rounded=0;html=1;fillColor=#eaf0f6;strokeColor={LINE};align=left;spacingLeft=14;verticalAlign=middle;fontFamily=Arial;fontSize=20;connectable=0;")
        ET.SubElement(header,"mxGeometry",x="0",y="0",width=str(w),height="64",attrib={"as":"geometry"})
        for i,(keys,field,type_) in enumerate(node["rows"]):
            ry=y+64+i*30
            bg="#f7f9fb" if i%2 else "#ffffff"
            self.svg.append(f'<rect x="{x}" y="{ry}" width="{w}" height="30" fill="{bg}" stroke="#dbe2ea" stroke-width="0.65"/>')
            self.svg.append(f'<text x="{x+12}" y="{ry+21}" font-size="13" font-weight="700" fill="#1f456c">{html.escape(keys)}</text>')
            self.svg.append(f'<text x="{x+83}" y="{ry+21}" font-size="15">{html.escape(field)}</text>')
            self.svg.append(f'<text x="{x+w-12}" y="{ry+21}" font-size="12" text-anchor="end" fill="{MUTED}">{html.escape(type_)}</text>')
            value=f'<table style="width:100%;font-family:Arial;border-collapse:collapse"><tr><td style="width:68px;font-size:13px;color:#1f456c"><b>{html.escape(keys)}</b></td><td style="font-size:15px">{html.escape(field)}</td><td style="font-size:12px;color:{MUTED};text-align:right">{html.escape(type_)}</td></tr></table>'
            row=ET.SubElement(self.root,"mxCell",id=f'{node["id"]}_row{i}',value=value,vertex="1",parent=node["id"],
                              style=f"rounded=0;html=1;fillColor={bg};strokeColor=#dbe2ea;strokeWidth=0.65;spacingLeft=10;spacingRight=10;align=left;verticalAlign=middle;connectable=0;")
            ET.SubElement(row,"mxGeometry",x="0",y=str(64+i*30),width=str(w),height="30",attrib={"as":"geometry"})

    def edge(self, relation, lookup, index):
        points=relation["points"]
        self.line(points,solid=relation["embedded"])
        self.endpoint(points[0],(points[1][0]-points[0][0],points[1][1]-points[0][1]),relation["start"])
        self.endpoint(points[-1],(points[-2][0]-points[-1][0],points[-2][1]-points[-1][1]),relation["end"])
        lx,ly=relation["label_at"]
        lw=len(relation["label"])*7.3+20
        self.svg.append(f'<rect x="{lx-lw/2}" y="{ly-17}" width="{lw}" height="25" fill="white"/>')
        a,b=lookup[relation["a"]],lookup[relation["b"]]
        sx,sy=points[0]; tx,ty=points[-1]
        style=(f"edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;strokeColor={LINE};strokeWidth=1.7;"
               f"startArrow={MARKER[relation['start']]};endArrow={MARKER[relation['end']]};startFill=0;endFill=0;startSize=16;endSize=16;"
               f"dashed={0 if relation['embedded'] else 1};dashPattern=7 5;"
               f"exitX={(sx-a['x'])/a['w']};exitY={(sy-a['y'])/a['h']};exitPerimeter=0;"
               f"entryX={(tx-b['x'])/b['w']};entryY={(ty-b['y'])/b['h']};entryPerimeter=0;")
        cell=ET.SubElement(self.root,"mxCell",id=f"relation{index}",value="",edge="1",parent="1",
                           source=relation["a"],target=relation["b"],style=style)
        geo=ET.SubElement(cell,"mxGeometry",relative="1",attrib={"as":"geometry"})
        if len(points)>2:
            arr=ET.SubElement(geo,"Array",attrib={"as":"points"})
            for px,py in points[1:-1]:
                ET.SubElement(arr,"mxPoint",x=str(px),y=str(py))
        self.text(relation["label"],lx,ly,14,color=MUTED,align="center",width=lw)

    def legend(self,y,notes):
        self.line([(60,y),(self.width-60,y)],solid=True,color="#c8d2dd")
        self.text("NOTATION",60,y+32,16,bold=True)
        for i,(card,label) in enumerate((("1","Exactly one"),("0..1","Zero or one"),("0..*","Zero or many"),("1..*","One or many"))):
            x=60+i*320
            self.line([(x,y+67),(x+72,y+67)],solid=True)
            self.endpoint((x,y+67),(1,0),card)
            self.text(f"{card}  {label}",x+88,y+73,14)
            cell=ET.SubElement(self.root,"mxCell",id=f"legend{i}",edge="1",parent="1",
                               style=f"edgeStyle=none;startArrow={MARKER[card]};endArrow=none;startFill=0;strokeColor={LINE};strokeWidth=1.7;startSize=16;")
            geo=ET.SubElement(cell,"mxGeometry",relative="1",attrib={"as":"geometry"})
            ET.SubElement(geo,"mxPoint",x=str(x),y=str(y+67),attrib={"as":"sourcePoint"})
            ET.SubElement(geo,"mxPoint",x=str(x+72),y=str(y+67),attrib={"as":"targetPoint"})
        self.text("PK = document identifier   UQ = unique index   FK = logical ObjectId reference   ? = nullable / optional",60,y+111,14)
        self.text("Dashed = non-identifying reference; each document has its own _id. Solid = embedded ownership, not a separate collection.",60,y+142,14)
        for i,note in enumerate(notes): self.text(note,60,y+178+i*29,14,color=MUTED)

    def save(self):
        self.svg.append("</g></svg>")
        OUT.mkdir(parents=True,exist_ok=True)
        (OUT/f"{self.name}.svg").write_text("\n".join(self.svg),encoding="utf-8")
        ET.indent(self.mxfile)
        ET.ElementTree(self.mxfile).write(OUT/f"{self.name}.drawio",encoding="utf-8",xml_declaration=True)


def core():
    nodes=[
        entity("user","User","collection: users",660,160,[
            ("PK","_id","ObjectId"),("UQ","email","string"),("UQ?","googleSubject","string?"),
            ("","name","string"),("","role / isActive","enum / bool"),("","passwordHash","string?"),("FK[]","assignedEvents","Event[]")]),
        entity("event","Event","collection: events",60,380,[
            ("PK","_id","ObjectId"),("UQ","slug","string"),("","name / category","string / enum"),
            ("","participationType","enum"),("","minTeamSize / maxTeamSize","number"),("","feeInr","number"),
            ("","eventDate / venue","date / string"),("","status / maxSlots","enum / number?")]),
        entity("team","Team","collection: teams",60,920,[
            ("PK","_id","ObjectId"),("FK","eventId","Event"),("FK","leaderId","User"),
            ("UQ","joinCode","string"),("","teamName","string"),("","members[]","embedded"),
            ("","status / rosterVersion","enum / number"),("FK?","mergedIntoTeamId","Team?")]),
        entity("registration","Registration","collection: registrations",660,575,[
            ("PK","_id","ObjectId"),("UQ","regId","string"),("FK","eventId","Event"),
            ("FK","leaderId","User"),("FK?","teamId","Team?"),("FK?","paymentId","Payment?"),
            ("","feeSnapshotInr","number"),("","status / nocStatus","enum"),("","refundReviewStatus","enum?")]),
        entity("payment","Payment","collection: payments",1260,380,[
            ("PK","_id","ObjectId"),("FK","registrationId","Registration"),("FK","eventId / payerId","Event / User"),
            ("FK?","gatewayOrderId","GatewayOrder?"),("","provider","enum"),("UQ?","providerPaymentId","string?"),
            ("UQ?","utr","string?"),("","amountInr / status","number / enum"),("FK?","reviewedBy","User?")]),
        entity("order","GatewayOrder","collection: gatewayorders",1260,940,[
            ("PK","_id","ObjectId"),("FK,UQ","registrationId","Registration"),("FK","eventId / payerId","Event / User"),
            ("UQ?","providerOrderId","string?"),("UQ?","providerPaymentId","string?"),("FK?","paymentId","Payment?"),
            ("","amountPaise / currency","number / enum"),("","status / settledAt","enum / date?")]),
        entity("pass","Pass","collection: passes",660,1110,[
            ("PK","_id","ObjectId"),("UQ","passId / token","string"),("FK","registrationId","Registration"),
            ("FK","eventId / userId","Event / User"),("","status / checkInStatus","enum"),
            ("","checkedInAt / expiresAt","date?"),("FK?","scannedBy","User?")])]
    edges=[
        relationship("user","registration","1","0..*",[(875,434),(875,575)],"leads",(920,509)),
        relationship("event","team","1","0..*",[(275,684),(275,920)],"has teams",(340,805)),
        relationship("event","registration","1","0..*",[(490,460),(550,460),(550,675),(660,675)],"registrations",(560,559)),
        relationship("team","registration","0..1","0..1",[(490,1000),(590,1000),(590,790),(660,790)],"optional team",(567,896)),
        relationship("registration","payment","1","0..*",[(1090,675),(1190,675),(1190,460),(1260,460)],"payment history",(1190,559)),
        relationship("registration","order","1","0..1",[(1090,790),(1150,790),(1150,1020),(1260,1020)],"checkout order",(1155,898)),
        relationship("payment","order","0..*","0..1",[(1475,714),(1475,940)],"gateway receipt",(1555,830)),
        relationship("registration","pass","1","0..*",[(875,909),(875,1110)],"issues personal passes",(995,1018))]
    d=Diagram("entity-relationship","Muster | Core entity–relationship model","Physical MongoDB collections • logical relationships and database uniqueness • focused registration and payment view",1750,1790)
    lookup={n["id"]:n for n in nodes}
    for i,e in enumerate(edges): d.edge(e,lookup,i)
    for n in nodes: d.box(n)
    d.legend(1450,[
        "Composite UQ: Registration(eventId, leaderId); Registration(eventId, teamId) when teamId exists; Pass(registrationId, userId); Team(teamName, eventId).",
        "Registration.paymentId and GatewayOrder.paymentId select a receipt; they do not replace Payment history. A manual receipt may have no gateway order.",
        "Team ↔ Registration is optional on both sides; solo registrations have no team. Team membership is detailed in the supporting view.",
        "Only lifecycle relationships are drawn. Other role-based refs remain in rows; the documentation catalogs every ObjectId relationship.",
        "FK denotes an application reference, not an SQL foreign-key constraint. Required refs plus service consistency define logical cardinality."])
    d.save()


def supporting():
    nodes=[
        entity("memberUser","User","users • identity context",60,220,[
            ("PK","_id","ObjectId"),("UQ","email","string"),("","name","string"),("","isActive","bool")],390),
        entity("invite","TeamInvite","collection: teaminvites",600,220,[
            ("PK","_id","ObjectId"),("FK","teamId / eventId","Team / Event"),("FK","invitedBy","User"),
            ("FK?","invitedUser","User?"),("","invitedEmail","string?"),("","status / expiresAt","enum / date"),("","tokenHash","string?")],390),
        entity("memberTeam","Team","teams • ownership context",60,750,[
            ("PK","_id","ObjectId"),("FK","eventId / leaderId","Event / User"),("","members[]","embedded[]"),
            ("","closedRoster[]","embedded[]?"),("","rosterVersion","number"),("","status","enum")],390),
        entity("member","Team.members[]","embedded values • no collection / no _id",600,750,[
            ("FK","userId","User"),("","nameSnapshot","string"),("","emailSnapshot","string?"),
            ("","studentIdSnapshot","string?"),("","status / joinedAt","enum / date")],390),
        entity("deliveryUser","User","users • same identity, repeated context",1240,220,[
            ("PK","_id","ObjectId"),("UQ","email","string"),("","name","string"),("","isActive","bool")],390),
        entity("notification","Notification","collection: notifications",1740,220,[
            ("PK","_id","ObjectId"),("FK","userId","User"),("","type / title / message","string"),
            ("","dedupeKey","not unique"),("FK?","passId / registrationId","Pass / Registration"),
            ("FK?","eventId / teamId","Event / Team"),("","readAt / emailStatus","date? / enum")],390),
        entity("email","EmailJob","collection: emailjobs • durable outbox",1740,800,[
            ("PK","_id","ObjectId"),("UQ","dedupeKey","string"),("","to / subject / kind","string"),
            ("FK?","notificationId","Notification?"),("FK?","recipientId","User?"),
            ("FK?","inviteId / passId","TeamInvite / Pass"),("FK?","registrationId","Registration?"),
            ("FK?","eventId / teamId","Event / Team"),("","status / availableAt","enum / date"),
            ("","attempts / leaseUntil","number / date?")],390)]
    edges=[
        relationship("memberUser","invite","1","0..*",[(450,290),(600,290)],"invites as sender",(525,269)),
        relationship("memberUser","invite","0..1","0..*",[(450,365),(600,365)],"invited account",(525,397)),
        relationship("memberTeam","invite","1","0..*",[(450,810),(530,810),(530,494),(600,494)],"team invitations",(530,665)),
        relationship("memberTeam","member","1","0..*",[(450,915),(600,915)],"embeds",(525,889),True),
        relationship("memberUser","member","1","0..*",[(255,220),(255,185),(1090,185),(1090,830),(990,830)],"member account",(1090,611)),
        relationship("deliveryUser","notification","1","0..*",[(1630,310),(1740,310)],"receives",(1685,289)),
        relationship("notification","email","0..1","0..*",[(1935,494),(1935,800)],"delivery jobs",(2010,652)),
        relationship("deliveryUser","email","0..1","0..*",[(1435,404),(1435,1040),(1740,1040)],"optional recipient",(1575,1018))]
    d=Diagram("supporting-entities","Muster | Membership and message-delivery ER views","Separate bounded views keep notation readable; repeated User boxes represent the same physical users collection.",2200,1600)
    d.text("A. TEAM MEMBERSHIP & INVITATIONS",60,157,18,bold=True)
    d.text("B. NOTIFICATIONS & EMAIL OUTBOX",1240,157,18,bold=True)
    lookup={n["id"]:n for n in nodes}
    for i,e in enumerate(edges): d.edge(e,lookup,i)
    for n in nodes: d.box(n)
    d.legend(1210,[
        "Team.members[] and closedRoster[] are embedded values. Team.members.userId is indexed with eventId but is NOT unique or a member primary key.",
        "An invite may target an unregistered email, so invitedUser is nullable. Pending (teamId, invitedEmail) uniqueness uses a partial index.",
        "EmailJob may exist without a Notification or registered recipient. Neither optional reference is unique: the physical model allows many jobs.",
        "Other EmailJob and Notification subject refs are shown in rows; contextual links do not establish required parent relationships.",
        "Operational collections and polymorphic audit targets are omitted here; see the full relationship catalog."])
    d.save()


def conceptual():
    """Chen view: rectangle entities, relationship diamonds, oval attributes.

    Single participation is optional, double participation is mandatory.
    Cardinalities are printed at the entity end as (minimum, maximum).
    """
    d=Diagram("conceptual-er","Muster | Conceptual entity–relationship model",
              "Chen notation • domain concepts and participation • separate from the detailed MongoDB implementation views",1860,1410)
    shapes={}
    def shape(id_,kind,label,x,y,w,h,key=False):
        shapes[id_]=(x,y,w,h)
        fill = "#f5f8fb" if kind=="diamond" else "#eaf0f6" if kind=="rect" else "#ffffff"
        style=f"rounded=0;html=0;strokeColor={LINE};fillColor={fill};strokeWidth=1.7;fontFamily=Arial;fontSize=18;fontStyle={4 if key else 0};"
        if kind=="diamond":
            style="shape=rhombus;"+style
            d.svg.append(f'<polygon points="{x+w/2},{y} {x+w},{y+h/2} {x+w/2},{y+h} {x},{y+h/2}" fill="#f5f8fb" stroke="{LINE}" stroke-width="1.7"/>')
        elif kind=="oval":
            style="shape=ellipse;"+style
            d.svg.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="white" stroke="{LINE}" stroke-width="1.7"/>')
        else:
            d.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#eaf0f6" stroke="{LINE}" stroke-width="1.7"/>')
        d.svg.append(f'<text x="{x+w/2}" y="{y+h/2+6}" text-anchor="middle" font-size="18" text-decoration="{("underline" if key else "none")}">{html.escape(label)}</text>')
        cell=ET.SubElement(d.root,"mxCell",id=id_,value=label,vertex="1",parent="1",style=style)
        ET.SubElement(cell,"mxGeometry",x=str(x),y=str(y),width=str(w),height=str(h),attrib={"as":"geometry"})

    def shifted(points,offset):
        normals=[]
        for a,b in zip(points,points[1:]):
            dx,dy=b[0]-a[0],b[1]-a[1]
            norm=math.hypot(dx,dy)
            normals.append((-dy/norm,dx/norm))
        answer=[]
        for i,(x,y) in enumerate(points):
            if i==0: nx,ny=normals[0]
            elif i==len(points)-1: nx,ny=normals[-1]
            else:
                p,q=normals[i-1],normals[i]
                divisor=1+p[0]*q[0]+p[1]*q[1]
                nx,ny=(p[0]+q[0])/divisor,(p[1]+q[1])/divisor
            answer.append((x+offset*nx,y+offset*ny))
        return answer

    def connect(a,b,points,mandatory=False,card=None,card_at=None):
        routes=[shifted(points,-3),shifted(points,3)] if mandatory else [points]
        for p in routes:
            d.line(p,solid=True)
            d.counter+=1
            ax,ay,aw,ah=shapes[a]; bx,by,bw,bh=shapes[b]
            style=(f"edgeStyle=none;rounded=0;startArrow=none;endArrow=none;strokeColor={LINE};strokeWidth=1.7;"
                   f"exitX={(p[0][0]-ax)/aw};exitY={(p[0][1]-ay)/ah};exitPerimeter=0;"
                   f"entryX={(p[-1][0]-bx)/bw};entryY={(p[-1][1]-by)/bh};entryPerimeter=0;")
            cell=ET.SubElement(d.root,"mxCell",id=f"chen-edge{d.counter}",edge="1",parent="1",source=a,target=b,style=style)
            geo=ET.SubElement(cell,"mxGeometry",relative="1",attrib={"as":"geometry"})
            if len(p)>2:
                arr=ET.SubElement(geo,"Array",attrib={"as":"points"})
                for px,py in p[1:-1]: ET.SubElement(arr,"mxPoint",x=str(px),y=str(py))
        if card: d.text(card,*card_at,16,color=MUTED)

    # Entity concepts. The detail view, not this conceptual view, lists all fields.
    for id_,label,x,y in [
        ("c-user","User",770,240),("c-event","Event",130,390),("c-team","Team",130,850),
        ("c-reg","Registration",770,710),("c-pay","Payment",1410,390),("c-pass","Pass",1410,850)]:
        shape(id_,"rect",label,x,y,200,80)
    for id_,label,x,y in [
        ("c-leads","Leads",800,475),("c-records","Registers",480,585),
        ("c-teamReg","For team",480,905),("c-history","Receipts",1140,585),
        ("c-issues","Issues",1140,905),("c-hasTeams","Has teams",160,645),
        ("c-belongs","Belongs to",1140,135)]:
        shape(id_,"diamond",label,x,y,140,90)
    connect("c-user","c-leads",[(870,320),(870,475)],card="(0,N)",card_at=(893,356))
    connect("c-leads","c-reg",[(870,565),(870,710)],True,"(1,1)",(893,690))
    connect("c-event","c-records",[(330,430),(420,430),(420,630),(480,630)],False,"(0,N)",(350,413))
    connect("c-records","c-reg",[(620,630),(680,630),(680,750),(770,750)],True,"(1,1)",(712,733))
    connect("c-team","c-teamReg",[(330,890),(410,890),(410,950),(480,950)],False,"(0,1)",(350,873))
    connect("c-teamReg","c-reg",[(620,950),(690,950),(690,775),(770,775)],False,"(0,1)",(712,817))
    connect("c-reg","c-history",[(970,750),(1080,750),(1080,630),(1140,630)],False,"(0,N)",(990,733))
    connect("c-history","c-pay",[(1280,630),(1360,630),(1360,430),(1410,430)],True,"(1,1)",(1310,413))
    connect("c-reg","c-issues",[(970,775),(1050,775),(1050,950),(1140,950)],False,"(0,N)",(990,817))
    connect("c-issues","c-pass",[(1280,950),(1360,950),(1360,890),(1410,890)],True,"(1,1)",(1307,873))
    connect("c-event","c-hasTeams",[(230,470),(230,645)],False,"(0,N)",(253,520))
    connect("c-hasTeams","c-team",[(230,735),(230,850)],True,"(1,1)",(253,831))
    connect("c-user","c-belongs",[(970,280),(1110,280),(1110,180),(1140,180)],False,"(0,N)",(990,314))
    connect("c-belongs","c-pass",[(1280,180),(1780,180),(1780,890),(1610,890)],True,"(1,1)",(1640,873))
    # Attribute ovals and underlined document identifiers.
    for id_,parent,label,x,y,key,points in [
        ("a-user-id","c-user","_id",700,135,True,[(780,189),(810,240)]),
        ("a-user-email","c-user","email",940,135,False,[(1020,189),(930,240)]),
        ("a-event-id","c-event","_id",60,270,True,[(140,324),(180,390)]),
        ("a-event-slug","c-event","slug",290,270,False,[(370,324),(280,390)]),
        ("a-team-id","c-team","_id",60,1015,True,[(140,1015),(180,930)]),
        ("a-team-name","c-team","teamName",290,1015,False,[(370,1015),(280,930)]),
        ("a-reg-id","c-reg","_id",790,1015,True,[(870,1015),(870,790)]),
        ("a-pay-id","c-pay","_id",1340,270,True,[(1420,324),(1460,390)]),
        ("a-pay-amount","c-pay","amountInr",1580,270,False,[(1660,324),(1560,390)]),
        ("a-pass-id","c-pass","_id",1340,1015,True,[(1420,1015),(1460,930)]),
        ("a-pass-code","c-pass","passId",1580,1015,False,[(1660,1015),(1560,930)])]:
        shape(id_,"oval",label,x,y,160,54,key)
        connect(id_,parent,points)
    d.line([(60,1130),(1800,1130)],solid=True,color="#c8d2dd")
    d.text("CHEN NOTATION",60,1162,16,bold=True)
    d.text("Rectangle = entity   Diamond = relationship   Oval = attribute   Underlined attribute = primary identifier",60,1200,16)
    d.text("Single line = partial (optional) participation; double line = total (required) participation.",60,1231,16)
    d.text("(min,max) at an entity end counts its participation in that relationship. N means many; these are not flow arrows.",60,1262,16)
    d.text("Solo registrations have no Team. Each Pass belongs to one person; (registrationId, userId) is unique. Free entries need no Payment.",60,1298,15,color=MUTED)
    d.text("Registration has receipt history, not a mandatory 1:1 payment. Technical gateway, invitations, outbox and embedded membership are in the physical views.",60,1330,15,color=MUTED)
    d.save()


if __name__=="__main__":
    core()
    supporting()
    conceptual()
    print("Generated crow's-foot core/supporting and Chen conceptual ER diagrams (SVG + editable draw.io).")
