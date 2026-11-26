"""Native planar footprints and continuous analytic centerline networks."""
import math
from shapely.geometry import Polygon,Point,LineString
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_WIRE,TopAbs_EDGE,TopAbs_REVERSED
from OCP.TopoDS import TopoDS
from OCP.BRepTools import BRepTools,BRepTools_WireExplorer
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Line,GeomAbs_Circle
TAU=math.pi*2
def explore(s,k,cast):
 e=TopExp_Explorer(s,k)
 while e.More():yield cast(e.Current());e.Next()
def region(g):
 ps=[g] if g.geom_type=='Polygon' else list(getattr(g,'geoms',[]))
 return [dict(polygon=[list(p) for p in list(q.exterior.coords)[:-1]],holes=[[list(p) for p in list(h.coords)[:-1]] for h in q.interiors]) for q in ps if q.geom_type=='Polygon' and q.area>.1]
def face_geometry(face):
 outer=BRepTools.OuterWire_s(face);shell=[];holes=[]
 for wire in explore(face,TopAbs_WIRE,TopoDS.Wire):
  ex=BRepTools_WireExplorer(wire,face);points=[]
  while ex.More():
   edge=ex.Current();c=BRepAdaptor_Curve(edge);a,b=c.FirstParameter(),c.LastParameter();n=1
   if c.GetType()==GeomAbs_Circle:
    radius=c.Circle().Radius();n=max(2,math.ceil(abs(b-a)/(2*math.acos(max(-1,1-.02/radius)))))
   elif c.GetType()!=GeomAbs_Line:n=96
   qs=[]
   for j in range(n+1):p=c.Value(a+(b-a)*j/n);qs.append([p.X(),-p.Z()])
   if edge.Orientation()==TopAbs_REVERSED:qs.reverse()
   if points and math.dist(points[-1],qs[0])>.05 and math.dist(points[-1],qs[-1])<.05:qs.reverse()
   points.extend(qs if not points else qs[1:]);ex.Next()
  if wire.IsSame(outer):shell=points
  else:holes.append(points)
 return Polygon(shell,holes).buffer(0)
def arc_intervals(c):
 o=c.Circle().Location();center=[o.X(),-o.Z()];a,b=c.FirstParameter(),c.LastParameter();angles=[]
 for i in range(9):
  q=c.Value(a+(b-a)*i/8);v=math.atan2(-q.Z()-center[1],q.X()-center[0])
  if angles:
   while v-angles[-1]>math.pi:v-=TAU
   while v-angles[-1]<-math.pi:v+=TAU
  angles.append(v)
 lo=min(angles);hi=max(angles)
 while lo<0:lo+=TAU;hi+=TAU
 while lo>=TAU:lo-=TAU;hi-=TAU
 return center,c.Circle().Radius(),[(lo,min(hi,TAU))]+([(0,hi-TAU)] if hi>TAU else [])
def at(p,t):
 if p['type']=='line':return [p['start'][i]+t*(p['end'][i]-p['start'][i])/p['length'] for i in range(2)]
 a=p['angle']+t/p['length']*p['sweep'];return [p['center'][0]+p['radius']*math.cos(a),p['center'][1]+p['radius']*math.sin(a)]
def station(p,q):
 if p['type']=='line':return sum((q[i]-p['start'][i])*(p['end'][i]-p['start'][i])/p['length'] for i in range(2))
 a=(math.atan2(q[1]-p['center'][1],q[0]-p['center'][0])-p['angle'])%TAU
 if a>TAU-1e-6:a=0
 return a*p['radius']
def sample(p,step=30):return [at(p,p['length']*i/max(1,math.ceil(p['length']/step))) for i in range(max(1,math.ceil(p['length']/step))+1)]
def reverse(p):
 if p['type']=='line':return {**p,'start':p['end'],'end':p['start']}
 return {**p,'angle':p['angle']+p['sweep'],'sweep':-p['sweep']}
def slice_path(p,a,b):
 if p['type']=='line':return {**p,'start':at(p,a),'end':at(p,b),'length':b-a}
 return {**p,'angle':p['angle']+a/p['radius'],'sweep':(b-a)/p['radius'],'length':b-a}
def axes(g,faces):
 pg=g.buffer(.035);paths=[]
 for part in ([g] if g.geom_type=='Polygon' else g.geoms):
  ring=list(orient(part.simplify(.025,preserve_topology=True),sign=1).exterior.coords);edges=[]
  for a,b in zip(ring,ring[1:]):
   length=math.dist(a,b)
   if length>=150:edges.append((a,b,[(b[i]-a[i])/length for i in range(2)],length))
  for i,(a,b,u,L) in enumerate(edges):
   for c,d,v,M in edges[i+1:]:
    if sum(u[j]*v[j] for j in range(2))>-.999999:continue
    n=[-u[1],u[0]];w=sum((c[j]-a[j])*n[j] for j in range(2))
    if not 79.99<=w<=600.01:continue
    ts=[sum((q[j]-a[j])*u[j] for j in range(2)) for q in [c,d]];lo=max(0,min(ts));hi=min(L,max(ts))
    if hi-lo<max(100,w*.75):continue
    valid=True
    for f in [.05,.25,.5,.75,.95]:
     t=lo+(hi-lo)*f;p=[a[j]+u[j]*t for j in range(2)];q=[p[j]+n[j]*w for j in range(2)]
     if not pg.covers(LineString([p,q])):valid=False;break
    if valid:
     aa=[a[j]+u[j]*lo+n[j]*w/2 for j in range(2)];bb=[a[j]+u[j]*hi+n[j]*w/2 for j in range(2)]
     if tuple(aa)>tuple(bb):aa,bb=bb,aa
     paths.append(dict(type='line',start=aa,end=bb,length=math.dist(aa,bb),gw=w))
 circles=[]
 for face in faces:
  for edge in explore(face,TopAbs_EDGE,TopoDS.Edge):
   c=BRepAdaptor_Curve(edge)
   if c.GetType()==GeomAbs_Circle:circles.append(arc_intervals(c))
 for i,(o,r,ia) in enumerate(circles):
  for o2,r2,ib in circles[i+1:]:
   w=abs(r-r2)
   if math.dist(o,o2)>.02 or not 79.99<=w<=600.01:continue
   radius=(r+r2)/2
   for a,b in ia:
    for c,d in ib:
     lo=max(a,c);hi=min(b,d)
     if (hi-lo)*radius<100:continue
     p=dict(type='arc',center=o,radius=radius,angle=lo,sweep=hi-lo,length=(hi-lo)*radius,gw=w);valid=True
     for f in [.02,.25,.5,.75,.98]:
      ang=lo+(hi-lo)*f;pp=[[o[0]+rr*math.cos(ang),o[1]+rr*math.sin(ang)] for rr in [r,r2]]
      if any(g.boundary.distance(Point(q))>.06 for q in pp) or not pg.covers(LineString(pp)):valid=False;break
     if valid:paths.append(p)
 unique={}
 for p in paths:unique[(p['type'],tuple(round(v,2) for f in [0,.5,1] for v in at(p,p['length']*f)))]=p
 paths=list(unique.values())
 # Remove numerical seam splits between collinear pieces, independent of drawing handles.
 changed=True
 while changed:
  changed=False
  for i,p in enumerate(paths):
   if p['type']!='line':continue
   u=[(p['end'][j]-p['start'][j])/p['length'] for j in range(2)]
   for k in range(i+1,len(paths)):
    q=paths[k]
    if q['type']!='line' or abs(p['gw']-q['gw'])>.05:continue
    v=[(q['end'][j]-q['start'][j])/q['length'] for j in range(2)]
    if abs(sum(u[j]*v[j] for j in range(2)))<.999999:continue
    if max(abs((v0[0]-p['start'][0])*u[1]-(v0[1]-p['start'][1])*u[0]) for v0 in [q['start'],q['end']])>.04:continue
    ts=sorted([station(p,q['start']),station(p,q['end'])])
    if ts[0]>p['length']+.05 or ts[1]<-.05:continue
    lo=min(0,ts[0]);hi=max(p['length'],ts[1]);paths[i]={**p,'start':at(p,lo),'end':at(p,hi),'length':hi-lo};paths.pop(k);changed=True;break
   if changed:break
 return paths
def stitch(paths,g):
 """Connect a native centerline graph; degree-two seams never reset spacing."""
 paths=[dict(p) for p in paths];pg=g.buffer(.04)
 # Connect branch axes at their true intersections, including half-width cap gaps.
 for i,p in enumerate(paths):
  if p['type']!='line':continue
  for q in paths[i+1:]:
   if q['type']=='line':
    u=[(p['end'][j]-p['start'][j])/p['length'] for j in range(2)];v=[(q['end'][j]-q['start'][j])/q['length'] for j in range(2)];den=u[0]*v[1]-u[1]*v[0]
    if abs(den)<1e-6:continue
    d=[q['start'][j]-p['start'][j] for j in range(2)];tp=(d[0]*v[1]-d[1]*v[0])/den;pt=at(p,tp);tq=station(q,pt)
    if not (-q['gw']/2-.05<=tp<=p['length']+q['gw']/2+.05 and -p['gw']/2-.05<=tq<=q['length']+p['gw']/2+.05) or not pg.covers(Point(pt)):continue
    for row,t in [(p,tp),(q,tq)]:
     if t<0:row['start']=pt;row['length']=math.dist(row['start'],row['end'])
     elif t>row['length']:row['end']=pt;row['length']=math.dist(row['start'],row['end'])
   else:
    for end in [at(q,0),at(q,q['length'])]:
     t=station(p,end);project=at(p,t)
     if math.dist(project,end)<.06 and -p['gw']/2-.05<=t<=p['length']+p['gw']/2+.05 and pg.covers(Point(end)):
      if t<0:p['start']=end;p['length']=math.dist(p['start'],p['end'])
      elif t>p['length']:p['end']=end;p['length']=math.dist(p['start'],p['end'])
 cuts=[[0,p['length']] for p in paths]
 for i,p in enumerate(paths):
  for j,q in enumerate(paths[i+1:],i+1):
   hit=LineString(sample(p,5)).intersection(LineString(sample(q,5)))
   points=[hit] if hit.geom_type=='Point' else [v for v in getattr(hit,'geoms',[]) if v.geom_type=='Point']
   # Exact analytic endpoints are retained even when chord approximation misses a tangent.
   pts=[list(v.coords)[0] for v in points]
   for a in [at(p,0),at(p,p['length'])]:
    for b in [at(q,0),at(q,q['length'])]:
     if math.dist(a,b)<.08:pts.append(a)
   for pt in pts:
    for k,row in [(i,p),(j,q)]:
     t=station(row,pt)
     if -.08<=t<=row['length']+.08:cuts[k].append(max(0,min(row['length'],t)))
 nodes=[];edges=[];adj={}
 def node(p):
  for i,q in enumerate(nodes):
   if math.dist(p,q)<.08:return i
  nodes.append(p);return len(nodes)-1
 for p,ts in zip(paths,cuts):
  vals=[]
  for v in sorted(ts):
   if not vals or v-vals[-1]>.1:vals.append(v)
  for a,b in zip(vals,vals[1:]):
   if b-a<.1:continue
   row=slice_path(p,a,b);n1=node(at(row,0));n2=node(at(row,row['length']));eid=len(edges);edges.append((n1,n2,row));adj.setdefault(n1,[]).append(eid);adj.setdefault(n2,[]).append(eid)
 used=set();runs=[]
 def trace(start,eid):
  parts=[];cur=start;first=start
  while eid not in used:
   used.add(eid);a,b,p=edges[eid];forward=cur==a;parts.append(p if forward else reverse(p));cur=b if forward else a
   choices=[e for e in adj[cur] if e not in used]
   if len(adj[cur])!=2 or not choices:break
   eid=choices[0]
  path=parts[0] if len(parts)==1 else dict(type='chain',parts=parts,length=sum(p['length'] for p in parts),gw=max(p['gw'] for p in parts))
  runs.append(dict(path=path,startNode=first,endNode=cur,closed=first==cur,startBranch=len(adj[first])>2,endBranch=len(adj[cur])>2))
 for n in sorted(adj,key=lambda n:tuple(nodes[n])):
  if len(adj[n])!=2:
   for e in adj[n]:
    if e not in used:trace(n,e)
 for i,(a,b,p) in enumerate(edges):
  if i not in used:trace(a,i)
 return runs
