from pathlib import Path
import json,sys,math,re,collections
ROOT=Path(__file__).parent
raw=json.loads((ROOT/'raw-blocks.json').read_text(encoding='utf8'))
def vals(e,k):return [p[2] if len(p)>2 and p[1]=='.' else p[1:] for p in e if p[0]==k]
def val(e,k,d=None):return next(iter(vals(e,k)),d)
def pt(T,p):return [T[0]*p[0]+T[2]*p[1]+T[4],T[1]*p[0]+T[3]*p[1]+T[5]]
def mul(A,B):return [A[0]*B[0]+A[2]*B[1],A[1]*B[0]+A[3]*B[1],A[0]*B[2]+A[2]*B[3],A[1]*B[2]+A[3]*B[3],*pt(A,B[4:])]
shapes=[];texts=[];dimensions=[];unread=collections.Counter()
def walk(es,T=[1,0,0,1,0,0],parent='',path='',depth=0):
 if depth>10:return
 for e in es:
  kind=val(e,0);layer=val(e,8,'0');layer=parent if layer=='0' and parent else layer;handle=path+val(e,5,'?')
  if kind=='INSERT':
   name=val(e,2);a=val(e,50,0);sx=val(e,41,1);sy=val(e,42,1);p=val(e,10,[0,0]);B=[sx*math.cos(a),sx*math.sin(a),-sy*math.sin(a),sy*math.cos(a),p[0],p[1]]
   if name in raw:walk(raw[name],mul(T,B),layer,handle+'/',depth+1)
   else:unread['missingBlock']+=1
   continue
  base={'source':handle,'layer':layer,'entityType':kind}
  if kind in ['TEXT','MTEXT']:
   s=''.join(vals(e,3))+val(e,1,'');s=re.sub(r'\\U\+([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)),s);s=s.replace('\\P',' ');p=val(e,10)
   if p:texts.append(dict(base,text=s,at=pt(T,p),angle=val(e,50,0)+math.atan2(T[1],T[0])))
  elif kind=='DIMENSION':
   dimensions.append(dict(base,measurement=val(e,42),text=val(e,1,''),points={str(k):pt(T,val(e,k)) for k in [10,11,13,14] if val(e,k)}))
  elif kind=='LINE':
   if val(e,10) and val(e,11):shapes.append(dict(base,closed=False,points=[pt(T,val(e,10)),pt(T,val(e,11))],segments=[dict(type='line',a=pt(T,val(e,10)),b=pt(T,val(e,11)))]))
  elif kind=='LWPOLYLINE':
   vertices=[]
   for p in e:
    if p[0]==10:vertices.append({'at':p[1:],'bulge':0})
    elif p[0]==42 and vertices:vertices[-1]['bulge']=p[2]
   closed=bool(val(e,70,0)&1);segments=[];points=[]
   for i,v in enumerate(vertices[:len(vertices) if closed else max(0,len(vertices)-1)]):
    a=v['at'];b=vertices[(i+1)%len(vertices)]['at'];bulge=v['bulge'];length=math.dist(a[:2],b[:2])
    if length<1e-7:continue
    if abs(bulge)<1e-9:seg={'type':'line','a':pt(T,a),'b':pt(T,b)};sample=[seg['a'],seg['b']]
    else:
     sweep=4*math.atan(bulge);dx=b[0]-a[0];dy=b[1]-a[1];center=[(a[0]+b[0])/2-dy*(1-bulge**2)/(4*bulge),(a[1]+b[1])/2+dx*(1-bulge**2)/(4*bulge)];radius=math.dist(a[:2],center);start=math.atan2(a[1]-center[1],a[0]-center[0]);n=max(2,math.ceil(abs(sweep)/(2*math.acos(max(-1,1-.05/radius)))));sample=[pt(T,[center[0]+radius*math.cos(start+sweep*j/n),center[1]+radius*math.sin(start+sweep*j/n)]) for j in range(n+1)];seg={'type':'arc','a':sample[0],'b':sample[-1],'center':pt(T,center),'radius':radius*math.hypot(T[0],T[1]),'start':start+math.atan2(T[1],T[0]),'sweep':sweep,'length':abs(sweep)*radius}
    segments.append(seg);points.extend(sample if not points else sample[1:])
   if points:shapes.append(dict(base,closed=closed,points=points,segments=segments))
  elif kind in ['ARC','CIRCLE']:
   center=val(e,10);radius=val(e,40);start=val(e,50,0);end=val(e,51,2*math.pi);sweep=(end-start)%(2*math.pi) if kind=='ARC' else 2*math.pi;n=max(4,math.ceil(sweep/(2*math.acos(max(-1,1-.05/radius)))));points=[pt(T,[center[0]+radius*math.cos(start+sweep*j/n),center[1]+radius*math.sin(start+sweep*j/n)]) for j in range(n+1)];shapes.append(dict(base,closed=kind=='CIRCLE',points=points,segments=[dict(type='arc',center=pt(T,center),radius=radius,start=start,sweep=sweep,length=sweep*radius,a=points[0],b=points[-1])]))
  else:unread[kind]+=1
walk(raw['*Model_Space'])
out=dict(shapes=shapes,texts=texts,dimensions=dimensions,unread=dict(unread));(ROOT/'dwg-geometry.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps({'shapes':len(shapes),'texts':len(texts),'dimensions':len(dimensions),'closedByLayer':collections.Counter(s['layer'] for s in shapes if s['closed']),'glLabels':[(t['text'],t['at']) for t in texts if re.search(r'GL\s*[:：]',t['text'])][:12]},ensure_ascii=True))
