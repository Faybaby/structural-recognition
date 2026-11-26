"""Three disjoint views, GL-first heights, shared upper/lower support coordinates."""
import sys,json,copy,math,collections
from pathlib import Path
from gl_effective import ROOT,effective_sections,index_for,enrich_sources
from hanging_rectangles import find_rectangles
from compact_floor import layout,coverage_missing,spacing_pass
from overlap_calculation import poly,clean,parts,svg_path,key,build_links
from shapely.geometry import Point,Polygon,LineString,GeometryCollection
from shapely.ops import unary_union,substring
from shapely import get_coordinates
from interface_layout import align_floor,connected
ALIGNED='--aligned' in sys.argv
from arc_geometry import beam_axis,beam_length,beam_point,beam_station,beam_angle,edge

BASE=enrich_sources(json.loads((ROOT/'enriched-baseline.json').read_text(encoding='utf-8')))

def polygon_records(g):return [dict(polygon=[list(q) for q in list(p.exterior.coords)[:-1]],holes=[[list(q) for q in list(r.coords)[:-1]] for r in p.interiors]) for p in parts(g)]
def endpoints(g):
 if g.is_empty:return []
 if g.geom_type=='Point':return [list(g.coords[0])]
 if g.geom_type in ['LineString','LinearRing']:return [list(g.coords[0]),list(g.coords[-1])]
 return [p for sub in getattr(g,'geoms',[]) for p in endpoints(sub)]
def line_interval(host,lo,hi):
 n=max(1,math.ceil((hi-lo)/40)) if host.get('curved') else 1
 return LineString([beam_point(host,lo+(hi-lo)*i/n) for i in range(n+1)])

class Source:
 def __init__(self,p):
  self.p=p;self.key=p['key'];self.hosts,self.sections,self.gl,self.unmatched=effective_sections(p)
  self.holes=unary_union([poly(o['polygon']) for o in p['openings']]);self.walls=unary_union([poly(w['polygon']) for w in p['walls'] if '墙' in w.get('layer','') or '柱' in w.get('layer','')])
  self.beams=unary_union([poly(b['polygon']) for b in self.hosts]);self.footprint=clean(unary_union([self.beams,*[Polygon(s['polygon'],s.get('holes',[])) for s in p['slabs']]]).difference(self.walls).difference(self.holes))
  self.floors={s['id']:clean(Polygon(s['polygon'],s.get('holes',[])).difference(self.walls).difference(self.holes).difference(self.beams)) for s in p['slabs']}
  self.floor_layout={};self.nodes={};self.cancelled=[];self.issues=[];self.caps,self.cap_audit=find_rectangles(p)
  for s in p['slabs']:
   g=self.floors[s['id']]
   if not g.is_empty:self.floor_layout[s['id']]=layout(g,s['limitX'],s['limitY'],[poly(o['polygon']) for o in p['openings']])
  for e in self.caps:
   h=next((b for b in self.hosts if b['id']==e['owner']),None)
   if not h:continue
   ss=[beam_station(h,pt) for pt in e['rectVertices']];r=index_for(h['width'],e['glDimension'],h.get('adjacentThicknesses') or [h['thickness']])
   self.sections.append(dict(id=p['key']+'-CAP-'+e['id'],plan=p['key'],host=h,source=e['source'],lo=min(ss),hi=max(ss),g=poly(e['rectVertices']),depth=e['glDimension'],width=h['width'],thicknesses=h.get('adjacentThicknesses') or [h['thickness']],gl=[dict(gl=e['gl'],glSource=e['glSource'],source=e['source'],glHeight=e['glDimension'])],index=r['S'] if r else None,limit=r['S']-100 if r else None,cells=[r['Cell']] if r else [],priority='挂梁实际端部GL高优先'))
 def hit(self,at):
  pt=Point(at)
  if not self.footprint.buffer(.11).covers(pt) or self.holes.distance(pt)<150-1e-6:return None
  hosts=[b for b in self.hosts if poly(b['polygon']).buffer(.11).covers(pt)]
  if hosts:
   centered=[b for b in hosts if beam_axis(b).distance(pt)<=.11]
   if not centered:return None
   h=max(centered,key=lambda b:(b['width'],b['depth']));return dict(kind='梁',data=h,model='GD100X'+str(h['width']),owner=h['id'],source=h['source'])
  for s in self.p['slabs']:
   if not self.floors[s['id']].is_empty and self.floors[s['id']].buffer(.11).covers(pt):return dict(kind='板',data=s,model='GD',owner=s['id'],source=s['source'])
  return None
 def put(self,at,shared=False,governing=None):
  at=key(at);hit=self.hit(at)
  if not hit:return None
  if at in self.nodes:
   if governing:self.nodes[at].setdefault('controls',[]).append(governing)
   return self.nodes[at]
  n=dict(id='',at=list(at),kind=hit['kind'],model=hit['model'],owner=hit['owner'],source=hit['source'],layer=self.p['name'],cell=hit['data'].get('cell',''),angle=beam_angle(hit['data'],at) if hit['kind']=='梁' else 0,scope='common' if shared else 'independent',zone='O' if shared else self.key.upper(),inOverlap=shared,requiredAlignment=shared,alignmentPaired=shared,commonId='',alignmentPairId='',connectionRequired=shared,terminal=False,controls=[governing] if governing else [],signature=[],station=beam_station(hit['data'],at) if hit['kind']=='梁' else None,alignmentPolicy='重叠区统一坐标，上下各一根' if shared else '本层差异区单独计算')
  self.nodes[at]=n;return n

SOURCES={p['key']:Source(p) for p in BASE['plans']};A=SOURCES['odd'];B=SOURCES['even']
OVERLAP=clean(A.footprint.intersection(B.footprint));ONLY={k:clean(s.footprint.difference(OVERLAP)) for k,s in SOURCES.items()}
# One-hop association: complete physical beams touching the true difference by
# positive boundary length or positive area; do not flood along the entire beam network.
RELATED={k:[h for h in s.hosts if poly(h['polygon']).intersection(ONLY[k]).area>1 or poly(h['polygon']).intersection(ONLY[k].buffer(.11)).area>10] for k,s in SOURCES.items()}
HALO=clean(unary_union([poly(h['polygon']) for hs in RELATED.values() for h in hs]))
VIEW_COMMON=clean(OVERLAP.difference(HALO))
VIEW_DIFF={k:clean(s.footprint.difference(VIEW_COMMON)) for k,s in SOURCES.items()}
ALIGN_AUDIT=[]
ALL=[e for s in SOURCES.values() for e in s.sections];WALLS=unary_union([s.walls for s in SOURCES.values()]);HOLES=unary_union([s.holes for s in SOURCES.values()])

def control_records(domain,guides,contributors,label):
 records=[];seen=set()
 for e in guides:
  h=e['host'];axis=beam_axis(h);cuts={e['lo'],e['hi']}
  for g in [domain.boundary,*[o['g'].boundary for o in contributors if o['g'].intersects(axis)]]:
   for at in endpoints(axis.intersection(g)):
    t=beam_station(h,at)
    if e['lo']+.05<t<e['hi']-.05:cuts.add(round(t,5))
  cs=sorted(cuts)
  for lo,hi in zip(cs,cs[1:]):
   if hi-lo<.2:continue
   mid=beam_point(h,(lo+hi)/2)
   if not domain.covers(Point(mid)):continue
   active=[q for q in contributors if q['g'].buffer(.11).covers(Point(mid)) and (q['plan']==e['plan'] or OVERLAP.covers(Point(mid)))]
   if not active:continue
   depth=max(q['depth'] for q in active);width=max(q['width'] for q in active);request=sorted({(q['width'],t) for q in active for t in q['thicknesses']});rows=[index_for(w,depth,[t]) for w,t in request];valid=bool(rows) and all(r for r in rows);idx=min(r['S'] for r in rows) if valid else None
   aa,bb=beam_point(h,lo),beam_point(h,hi);token=(tuple(sorted([key(aa),key(bb)])),key(mid),depth,tuple(request))
   if token in seen:continue
   seen.add(token);line=line_interval(h,lo,hi);g=clean(unary_union([q['g'] for q in active]).intersection(line.buffer(width/2+.05,cap_style=2,join_style=2)).intersection(domain))
   if g.is_empty:continue
   rec=dict(id=label+'-B'+str(len(records)+1).zfill(3),host=h,lo=lo,hi=hi,g=g,line=line,depth=depth,width=width,index=idx,limit=idx-100 if valid else None,cell=' / '.join(sorted({r['Cell'] for r in rows if r})),sources=active,rows=rows,request=request,label=label,glNames=sorted({m['gl'] for q in active for m in q['gl']}),status=('梁宽向上取档后查表' if any(r['WidthRoundedUp'] for r in rows) else '实体梁宽原档查表') if valid else '向上查无完整索引，未生成梁下间距')
   records.append(rec)
 return records

JOINT=control_records(OVERLAP,ALL,ALL,'O')
DIFF={k:control_records(ONLY[k],s.sections,s.sections,k.upper()) for k,s in SOURCES.items()}
REMOVED=[]

def beam_candidates(rec,source=None):
 if rec['limit'] is None:return []
 h=rec['host'];lo,hi=rec['lo'],rec['hi'];limit=rec['limit'];line=rec['line'];walls=source.walls if source else WALLS;holes=source.holes if source else HOLES
 # Source-only candidates identify what the wall rule removes, independently of final nodes.
 n=max(1,math.ceil((hi-lo)/limit)-1);gap=min(limit,(hi-lo)/n);nominal=[(lo+hi)/2+(i-(n-1)/2)*gap for i in range(n)]
 for t in nominal:
  at=beam_point(h,t);dist=walls.distance(Point(at))
  if dist<limit:REMOVED.append(dict(record=rec['id'],view=rec['label'],at=at,distance=dist,limit=limit,reason='梁下固顶中心距墙边小于本段计算间距，取消'))
 allowed=line.difference(walls.buffer(limit+.1)).difference(holes.buffer(150.1)).intersection(rec['g'].buffer(.1));out=[]
 for g in [allowed] if allowed.geom_type=='LineString' else getattr(allowed,'geoms',[]):
  if g.geom_type!='LineString' or g.length<.1:continue
  aa=min(beam_station(h,pt) for pt in [g.coords[0],g.coords[-1]]);bb=max(beam_station(h,pt) for pt in [g.coords[0],g.coords[-1]])
  full=abs(aa-lo)<.2 and abs(bb-hi)<.2
  if full:
   count=max(1,math.ceil((bb-aa)/limit)-1);step=min(limit,(bb-aa)/count);stations=[(aa+bb)/2+(i-(count-1)/2)*step for i in range(count)]
  else:
   count=max(1,math.ceil((bb-aa)/limit));stations=[aa+(bb-aa)*i/count for i in range(count+1)]
  for t in stations:
   at=key(beam_point(h,t))
   if walls.distance(Point(at))+1e-6>=limit and holes.distance(Point(at))+1e-6>=150:out.append(at)
 if source and ALIGNED and out and not h.get('curved'):
  anchors=[n['at'] for n in source.nodes.values() if n['inOverlap']]
  vertical=abs(h['b'][0]-h['a'][0])<.1;horizontal=abs(h['b'][1]-h['a'][1])<.1
  changed=[]
  for at in out:
   candidates=[]
   for ref in anchors:
    q=[at[0],ref[1]] if vertical else [ref[0],at[1]] if horizontal else at
    if math.dist(at,q)>limit/2 or not ONLY[source.key].covers(Point(q)) or not rec['g'].buffer(.11).covers(Point(q)):continue
    hit=source.hit(q)
    if hit and hit['kind']=='梁' and walls.distance(Point(q))>=limit and holes.distance(Point(q))>=150:candidates.append(q)
   changed.append(min(candidates,key=lambda q:math.dist(at,q)) if candidates else at)
  stations=sorted({beam_station(h,q) for q in changed});oldstations=sorted(beam_station(h,q) for q in out)
  quality=lambda ss:max([ss[0]-lo,hi-ss[-1],*[b-a for a,b in zip(ss,ss[1:])]])
  if stations and quality(stations)<=max(limit,quality(oldstations))+.11:
   ALIGN_AUDIT.append(dict(plan=source.key,kind='梁',owner=rec['id'],before=out,after=changed,moved=sum(math.dist(a,b)>.11 for a,b in zip(out,changed))))
   out=changed
 return out


def put_joint(at,control):
 at=key(at)
 if not OVERLAP.covers(Point(at)) or not A.hit(at) or not B.hit(at):return False
 A.put(at,True,control);B.put(at,True,control);return True

for r in JOINT:
 for at in beam_candidates(r):put_joint(at,r['id'])
for k,s in SOURCES.items():
 for r in DIFF[k]:
  for at in beam_candidates(r,s):
   if not OVERLAP.covers(Point(at)) and ONLY[k].covers(Point(at)):s.put(at,False,r['id'])

BEAM_UNION=unary_union([q['g'] for q in ALL]);FLOOR_PARTS=[]
for sa in A.p['slabs']:
 ga=A.floors[sa['id']]
 for sb in B.p['slabs']:
  g=clean(ga.intersection(B.floors[sb['id']]).intersection(OVERLAP))
  if g.is_empty or g.area<=1:continue
  qa=A.floor_layout.get(sa['id']);qb=B.floor_layout.get(sb['id']);exempt=qa and qb and qa['exempt'] and qb['exempt'];sx=min(sa['limitX'],sb['limitX']);sy=min(sa['limitY'],sb['limitY'])
  pts=[]
  if not exempt:
   for qq in [qa,qb]:
    if qq:pts.extend(at for at in qq['nodes'] if g.covers(Point(at)))
   # Cover clipped overlap pieces without declaring a narrow overlap fragment a new exempt floor.
   if coverage_missing(g,pts,sx,sy)>1:
    for part in parts(g):
     q=layout(part,sx,sy,[o for o in [A.holes,B.holes] if not o.is_empty])
     if q['exempt']:
      x0,y0,x1,y1=part.bounds;nx=max(1,math.ceil((x1-x0)/sx)-1);ny=max(1,math.ceil((y1-y0)/sy)-1);dx=min(sx,(x1-x0)/nx);dy=min(sy,(y1-y0)/ny)
      pts.extend(((x0+x1)/2+(i-(nx-1)/2)*dx,(y0+y1)/2+(j-(ny-1)/2)*dy) for i in range(nx) for j in range(ny))
     else:pts.extend(q['nodes'])
  placed=[]
  for at in pts:
   if put_joint(at,'FLOOR-'+sa['id']+'-'+sb['id']):placed.append(key(at))
  FLOOR_PARTS.append(dict(a=sa,b=sb,g=g,sx=sx,sy=sy,exempt=exempt,nodes=sorted(set(placed))))

for k,s in SOURCES.items():
 for sid,q in s.floor_layout.items():
  candidates=[at for at in q['nodes'] if not OVERLAP.covers(Point(at)) and ONLY[k].covers(Point(at))]
  if ALIGNED and not q['exempt']:
   g=clean(s.floors[sid].intersection(ONLY[k]));slab=next(ss for ss in s.p['slabs'] if ss['id']==sid)
   if not g.is_empty and g.area>1:
    aligned=align_floor(g,slab['limitX'],slab['limitY'],s.holes,[n['at'] for n in s.nodes.values() if n['inOverlap'] or n['kind']=='梁'],s.footprint,candidates)
    ALIGN_AUDIT.append(dict(plan=k,kind='楼面',owner=sid,before=candidates,after=aligned['nodes'],matched=aligned['matched'],tested=aligned['tested'],status=aligned['status']))
    candidates=aligned['nodes']
  for at in candidates:
   if not OVERLAP.covers(Point(at)) and ONLY[k].covers(Point(at)):s.put(at,False,'FLOOR-'+sid)

# Mandatory GL pocket centers still obey the newly confirmed wall cancellation rule.
for k,s in SOURCES.items():
 for e in s.caps:
  row=index_for(e['rectLength'] if e.get('rectWidth')==100 else next(h['width'] for h in s.hosts if h['id']==e['owner']),e['glDimension'],[next(h['thickness'] for h in s.hosts if h['id']==e['owner'])]);limit=row['S']-100 if row else None
  shared=OVERLAP.covers(Point(e['at']));walls=WALLS if shared else s.walls;dist=walls.distance(Point(e['at']));e.update(wallDistance=dist,wallLimit=limit,wallCancelled=limit is not None and dist<limit)
  if e['wallCancelled']:REMOVED.append(dict(record=e['id'],view='O' if shared else k.upper(),at=e['at'],distance=dist,limit=limit,reason='挂梁端部靠墙，中心距墙边小于计算间距，取消'));continue
  if row:
   if shared:put_joint(e['at'],e['id'])
   else:s.put(e['at'],False,e['id'])

for k,s in SOURCES.items():
 for at,n in list(s.nodes.items()):
  if n['kind']!='梁':continue
  relevant=[r for r in (JOINT if n['inOverlap'] else DIFF[k]) if r['limit'] and r['g'].buffer(.11).covers(Point(at))]
  limit=max((r['limit'] for r in relevant),default=0);walls=WALLS if n['inOverlap'] else s.walls;dist=walls.distance(Point(at))
  if limit and dist<limit-1e-6:
   REMOVED.append(dict(record=n['owner'],view='O' if n['inOverlap'] else k.upper(),at=list(at),distance=dist,limit=limit,reason='最终点位复核：中心距墙边小于计算间距'))
   if n['inOverlap']:
    for other in SOURCES.values():other.nodes.pop(at,None)
   else:s.nodes.pop(at,None)
shared_keys=sorted(at for at in A.nodes if OVERLAP.covers(Point(at)))
assert set(shared_keys)=={at for at in B.nodes if OVERLAP.covers(Point(at))},'Upper/lower overlap coordinates differ'
for i,at in enumerate(shared_keys):
 for s in [A,B]:s.nodes[at].update(commonId='O-N'+str(i+1).zfill(4),alignmentPairId='O-N'+str(i+1).zfill(4))
for k,s in SOURCES.items():
 for i,n in enumerate(sorted(s.nodes.values(),key=lambda n:(not n['inOverlap'],n['at']))):n['id']=('奇' if k=='odd' else '偶')+'-'+('O' if n['inOverlap'] else 'D')+str(i+1).zfill(4)

def links_for(s):
 out=[]
 for horizontal in [True,False]:
  groups=collections.defaultdict(list)
  for n in s.nodes.values():groups[n['at'][1] if horizontal else n['at'][0]].append(n)
  for row in groups.values():
   row.sort(key=lambda n:n['at'][0] if horizontal else n['at'][1])
   for a,b in zip(row,row[1:]):
    line=LineString([a['at'],b['at']]);mid=line.interpolate(.5,normalized=True)
    # Beam spacing governs rods along that beam axis, not a transverse floor-to-beam rod.
    axial=[r for r in [*JOINT,*DIFF[s.key]] if r['limit'] and r['line'].buffer(.11).covers(line)]
    floors=[q for q in s.p['slabs'] if Polygon(q['polygon'],q.get('holes',[])).intersection(line).length>.1]
    limit=min((r['limit'] for r in axial),default=1200) if axial else min((min(q['limitX'],q['limitY']) for q in floors),default=1200)
    if line.length<=limit+.11 and s.footprint.buffer(.11).covers(line):out.append(dict(a=a['at'],b=b['at'],length=round(line.length,3),limit=limit,spacingBasis='梁中心线' if axial else '相邻楼面索引',scope='common' if a['inOverlap'] and b['inOverlap'] and OVERLAP.buffer(.11).covers(line) else 'independent',layer=s.p['name']))
 for h in s.hosts:
  if not h.get('curved'):continue
  ns=sorted([n for n in s.nodes.values() if n['kind']=='梁' and beam_axis(h).distance(Point(n['at']))<=.11],key=lambda n:beam_station(h,n['at']))
  for a,b in zip(ns,ns[1:]):
   arc=beam_station(h,b['at'])-beam_station(h,a['at']);row=index_for(h['width'],h['depth'],h.get('adjacentThicknesses') or [h['thickness']]);line=LineString([a['at'],b['at']])
   if row and arc<=row['S']-100+.11 and not s.walls.intersection(line).length>.1:out.append(dict(a=a['at'],b=b['at'],length=line.length,arcLength=arc,kind='arcChord',owner=h['id'],connectionReview=not s.footprint.covers(line),scope='common' if a['inOverlap'] and b['inOverlap'] else 'independent',layer=s.p['name']))
 return out

for s in SOURCES.values():
 s.links=links_for(s);degree=collections.defaultdict(list)
 for link in s.links:
  degree[key(link['a'])].append(link);degree[key(link['b'])].append(link)
 for at,n in s.nodes.items():
  ls=degree[at];h=any(abs(e['a'][1]-e['b'][1])<.1 for e in ls);v=any(abs(e['a'][0]-e['b'][0])<.1 for e in ls);n.update(degree=len(ls),twoWay=h and v,cross=h and v and len(ls)==4)
 for audit in ALIGN_AUDIT:
  if audit['plan']!=s.key or audit['kind']!='楼面':continue
  ats={key(q) for q in audit['after']};actual=[]
  for link in s.links:
   a,b=key(link['a']),key(link['b'])
   if a in ats and b not in ats or b in ats and a not in ats:actual.append(dict(a=list(a),b=list(b),length=link['length']))
  audit['actualConnections']=actual;audit['actualConnectionCount']=len(actual)
  if not actual:audit['status']='当前约束下未接上外部支撑，保留候选并列对齐复核'

def record_json(r,nodes):
 h=r['host'];ns=sorted([n for n in nodes if r['line'].distance(Point(n['at']))<=.11 and r['lo']-.11<=beam_station(h,n['at'])<=r['hi']+.11],key=lambda n:beam_station(h,n['at']));ss=[beam_station(h,n['at'])-r['lo'] for n in ns];gap=max((b-a for a,b in zip(ss,ss[1:])),default=0);g=r['g'];largest=max(parts(g),key=lambda p:p.area);sources=[dict(layer=SOURCES[q['plan']].p['name'],source=q['source'],entityWidth=q['width'],ordinaryHeight=q['host']['depth'],effectiveHeight=q['depth'],gl=[m['gl'] for m in q['gl']],priority=q['priority']) for q in r['sources']]
 walls=WALLS if r['label']=='O' else SOURCES[r['label'].lower()].walls
 wall_exempt=r['limit'] is not None and r['line'].difference(walls.buffer(r['limit']+.1)).length<.1
 endpass=bool(ss) and max(ss[0],r['hi']-r['lo']-ss[-1])<=r['limit']+.11 if r['limit'] else False
 return dict(id=r['id'],source=' / '.join(sorted({q['source'] for q in r['sources']})),layer='重叠区' if r['label']=='O' else ('奇数层' if r['label']=='ODD' else '偶数层'),polygon=[list(q) for q in list(largest.exterior.coords)[:-1]],path=svg_path(g),width=r['width'],depth=r['depth'],thickness=max(t for q in r['sources'] for t in q['thicknesses']),model='GD100X'+str(r['width']),index=r['index'],limit=r['limit'],cell=r['cell'],a=beam_point(h,r['lo']),b=beam_point(h,r['hi']),curved=h.get('curved',False),partial=False,centerlinePoints=[list(q) for q in r['line'].coords],centerlineSegments=h.get('centerlineSegments',[]),centerlineLength=r['hi']-r['lo'],spacingBasis='解析中心线弧长' if h.get('curved') else '中心线长度',stations=[dict(node=n['id'],at=n['at'],station=round(t,3)) for n,t in zip(ns,ss)],intervals=[dict(fromNode=a['id'],toNode=b['id'],arcLength=round(y-x,3),chordLength=round(math.dist(a['at'],b['at']),3)) for a,b,x,y in zip(ns,ns[1:],ss,ss[1:])],check=dict(NodeCount=len(ns),MaxActual=gap,StartDistance=ss[0] if ss else -1,EndDistance=(r['hi']-r['lo']-ss[-1]) if ss else -1,SpacingPass=r['limit'] is not None and gap<=r['limit']+.11 and bool(ns),EndPass=endpass,WallExempt=wall_exempt),lookupWidths=sorted({row['LookupWidth'] for row in r['rows'] if row}),widthLookupRecords=[dict(entityWidth=row['EntityWidth'],lookupWidth=row['LookupWidth'],height=row['D'],thickness=row['T'],cell=row['Cell'],index=row['S']) for row in r['rows'] if row],parameterSources=sources,glNames=r['glNames'],governingRule='先取本层GL高，无GL才用普通标注；重叠区再取上下有效梁高最大值',ruleStatus=r['status'],pendingRule=r['limit'] is None,wallExempt=wall_exempt,dimensionSources=sorted({m['glSource'] for q in r['sources'] for m in q['gl']}),dimensionMethod='GL优先 / 双层最大梁高' if r['label']=='O' else 'GL优先 / 本层梁高',coverageNote='墙边取消范围：中心距墙边 < 本段索引−100mm；缺项区未推算间距',zones=['O' if r['label']=='O' else r['label']],composite=True)

def zone_json(g,id,name,scope,nodes):
 return dict(id=id,layer=name,scope=scope,path=svg_path(g),polygon=list(max(parts(g),key=lambda p:p.area).exterior.coords)[:-1] if parts(g) else [],area=round(g.area/1e6,5),center=list(g.representative_point().coords)[0] if not g.is_empty else [0,0],nodeCount=len(nodes),oddNodeCount=len(nodes) if scope=='common' or name=='奇数层' else 0,evenNodeCount=len(nodes) if scope=='common' or name=='偶数层' else 0,reason='只含两层几何交集；梁按GL优先后取最大有效梁高；共享坐标两层各计' if scope=='common' else '几何差集加周边完整关联梁；关联公共梁保留原同位号，不重复计量',regionType='joint' if scope=='common' else 'difference')

fullplans=[]
for k,s in SOURCES.items():
 p=copy.deepcopy(s.p);p['nodes']=list(s.nodes.values());p['links']=s.links;p['glBeams']=copy.deepcopy(s.gl);p['wallCancelled']=[r for r in REMOVED if r['view'] in ['O',k.upper()]];p['endSupports']=copy.deepcopy(s.caps)
 resolved={b['source'] for b in s.hosts if all(q['limit'] is not None for q in s.sections if q['source']==b['source'])}
 p['issues']=[dict(q,id=q.get('id') or k+'-SOURCE-'+str(i)) for i,q in enumerate(p['issues']) if q['category']!='布置检查' and not(q['category']=='索引缺项' and q['source'] in resolved)]
 for audit in ALIGN_AUDIT:
  if audit['plan']==k and audit['kind']=='楼面' and not audit['actualConnectionCount']:
   p['issues'].append(dict(id=k+'-ALIGN-'+audit['owner'],source='',owner=audit['owner'],at=audit['after'][0] if audit['after'] else list(s.floors[audit['owner']].representative_point().coords)[0],category='连接构造',scope='independent',zone=k.upper(),message='差异区对齐：原图不连续或墙边/洞口/间距约束下未形成外部连接，需复核接口'))
 for gl in p['glBeams']:
  relevant=[r for r in [*JOINT,*DIFF[k]] if any(m.get('source')==gl['source'] for q in r['sources'] if q['plan']==k for m in q['gl'])];gl['jointMaximumHeight']=max((r['depth'] for r in relevant if r['label']=='O'),default=gl['glHeight']);gl['governingLimits']=sorted({r['limit'] for r in relevant if r['limit']});gl['supports']=[dict(id=n['id'],at=n['at'],region='重叠区' if n['inOverlap'] else '本层差异区') for n in p['nodes'] if any(r['line'].distance(Point(n['at']))<.11 and r['lo']-.1<=beam_station(r['host'],n['at'])<=r['hi']+.1 for r in relevant)]
  if gl['index'] is None:p['issues'].append(dict(id=k+'-GL-'+gl['source'],source=gl['source'],owner=gl['host'],at=gl['at'],category='索引缺项',scope='common' if OVERLAP.covers(Point(gl['at'])) else 'independent',zone='O',message=f"GL高{gl['glHeight']}优先；实体梁宽{gl['entityWidth']}索引缺项，向上查表仍缺项，待补规则"))
 for e in p['endSupports']:
  n=s.nodes.get(key(e['at']));e.update(placed=bool(n),node=n['id'] if n else '',scope=n['scope'] if n else 'independent',zone=n['zone'] if n else '',endAt=e['rectVertices'][0],clearancePass=s.holes.distance(Point(e['at']))>=150,openingDistance=s.holes.distance(Point(e['at'])),requiredAlignment=bool(n and n['inOverlap']),alignmentPairId=n.get('alignmentPairId') if n else None,skipReason='靠墙端部取消：中心距墙边小于本段计算间距' if e.get('wallCancelled') else '')
 for slab in p['slabs']:
  q=copy.deepcopy(s.floor_layout.get(slab['id'],{}));q['preNodes']=copy.deepcopy(q.get('nodes',[]));ns=[n for n in p['nodes'] if n['kind']=='板' and n['owner']==slab['id']];q.update(nodeCount=len(ns),nodes=[n['at'] for n in ns],columns=len({n['at'][0] for n in ns}),rows=len({n['at'][1] for n in ns}),openingPolygons=[h['polygon'] for h in p['openings'] if poly(h['polygon']).distance(s.floors[slab['id']])<150.1],actualMinimumOpeningDistance=min((s.holes.distance(Point(n['at'])) for n in ns),default=None),coverageMissing=coverage_missing(s.floors[slab['id']],[n['at'] for n in ns],slab['limitX'],slab['limitY']) if not q.get('exempt') else 0,passed=False,strictGridRequired=False,aligned=True,alignNonOverlap=False,sharedCount=sum(n['inOverlap'] for n in ns),pendingAlignment=0,overlapBeamControlled=sum(n['inOverlap'] and any(c.startswith('O-B') for c in n['controls']) for n in ns),prelayoutNodeCount=len(q.get('nodes',[])),links=[[e['a'],e['b']] for e in s.links if any(n['at']==e['a'] for n in ns) and any(n['at']==e['b'] for n in ns)])
  q['spacingPass']=spacing_pass(s.floors[slab['id']],q['nodes'],slab['limitX'],slab['limitY']);q['passed']=q['spacingPass'] and q['coverageMissing']<=1 and (q['actualMinimumOpeningDistance'] is None or q['actualMinimumOpeningDistance']>=150-1e-6)
  slab['layout']=q;slab['check'].update(NodeCount=len(ns),SpacingPass=q['spacingPass'],EdgePass=q['coverageMissing']<=1)
  if not q['passed']:p['issues'].append(dict(id=k+'-FLOOR-'+slab['id'],at=list(s.floors[slab['id']].representative_point().coords)[0],owner=slab['id'],source=slab['source'],category='布置检查',scope='common',zone='O',message='统一点位后的楼面间距或边界覆盖待复核；未覆盖面积'+str(round(q['coverageMissing'],1))+'mm²'))
 p['summary'].update(nodes=len(p['nodes']),links=len(p['links']),issues=len(p['issues']),commonNodes=sum(n['inOverlap'] for n in p['nodes']),independentNodes=sum(not n['inOverlap'] for n in p['nodes']),floorCount=len(p['slabs']),floorLayoutPass=sum(s['layout']['passed'] for s in p['slabs']),exemptFloors=sum(slab['layout'].get('exempt',False) for slab in p['slabs']),singleFloors=sum(slab['layout']['nodeCount']==1 for slab in p['slabs']),twoFloors=sum(slab['layout']['nodeCount']==2 for slab in p['slabs']),beamEnds=len(p['endSupports']),endSupportsPlaced=sum(e['placed'] for e in p['endSupports']),inventory=dict(collections.Counter(n['model'] for n in p['nodes'])))
 p['arcIntervals']=[];fullplans.append(p)

shared_nodes=[]
for at in shared_keys:
 n=copy.deepcopy(A.nodes[at]);n['bothLayers']={k:dict(id=s.nodes[at]['id'],model=s.nodes[at]['model'],kind=s.nodes[at]['kind'],owner=s.nodes[at]['owner'],originalX=at[0]+s.p['offsetX'],originalY=at[1]) for k,s in SOURCES.items()};n['viewLayer']='重叠区（上下各一套）';shared_nodes.append(n)
views={}
for viewid,g in [('overlap',VIEW_COMMON),('odd',VIEW_DIFF['odd']),('even',VIEW_DIFF['even'])]:
 shared=viewid=='overlap';source=A if shared else SOURCES[viewid];name='重叠区' if shared else source.p['name']+'差异区';nodes=[n for n in shared_nodes if g.buffer(.11).covers(Point(n['at']))] if shared else [n for n in source.nodes.values() if g.buffer(.11).covers(Point(n['at']))];beamrecs=control_records(g,ALL if shared else source.sections,ALL if shared else ALL,'O' if shared else viewid.upper());beams=[record_json(r,nodes) for r in beamrecs];slabs=[]
 for p in fullplans if shared else [next(p for p in fullplans if p['key']==viewid)]:
  for slab in p['slabs']:
   clipped=clean(SOURCES[p['key']].floors[slab['id']].intersection(g).difference(BEAM_UNION) if shared else SOURCES[p['key']].floors[slab['id']].intersection(g))
   if clipped.is_empty or clipped.area<=1:continue
   out=copy.deepcopy(slab);out.update(id=p['key']+'-'+slab['id'],sourceId=slab['id'],sourcePlan=p['key'],path=svg_path(clipped),polygon=polygon_records(clipped)[0]['polygon'],area=round(clipped.area/1e6,5),layer=p['name']);slabs.append(out)
 all_links=A.links if shared else source.links;links=[e for e in all_links if g.buffer(.11).covers(LineString([e['a'],e['b']]))]
 issues=[dict(q,layer=p['name']) for p in fullplans if shared or p['key']==viewid for q in p['issues'] if q.get('at') and g.buffer(.11).covers(Point(q['at']))]
 caps=[e for p in fullplans if shared and p['key']=='odd' or not shared and p['key']==viewid for e in p['endSupports'] if g.buffer(.11).covers(Point(e['at']))]
 gls=[dict(gl,layer=p['name'],sourcePlan=p['key']) for p in fullplans if shared or p['key']==viewid for gl in p['glBeams'] if poly(gl['polygon']).intersection(g).area>1]
 for beam in beams:
  c=beam['check']
  if not beam['wallExempt'] and (beam['pendingRule'] or not c['SpacingPass'] or not c['EndPass']):issues.append(dict(id=beam['id']+'-CHECK',layer=name,at=beam['a'],owner=beam['id'],source=beam['source'],category='索引缺项' if beam['pendingRule'] else '布置检查',zone='O' if shared else viewid.upper(),message='向上取档仍缺索引' if beam['pendingRule'] else '本段间距/端距未全部满足，需结合墙边取消和跨层轴线冲突复核'))
 summary=dict(nodes=len(nodes),beams=len(beams),slabs=len(slabs),links=len(links),issues=len(issues),commonNodes=len(nodes) if shared else 0,independentNodes=0 if shared else len(nodes),commonZones=len(parts(g)) if shared else 0,independentZones=0 if shared else len(parts(g)),floorCount=len(slabs),floorLayoutPass=len(slabs),exemptFloors=sum(q['layout'].get('exempt',False) for q in slabs),singleFloors=sum(q['layout']['nodeCount']==1 for q in slabs),twoFloors=sum(q['layout']['nodeCount']==2 for q in slabs),beamEnds=len(caps),endSupportsPlaced=sum(e['placed'] for e in caps),inventory=dict(collections.Counter(n['model'] for n in nodes)),glCount=len(gls),glPending=sum(gl['index'] is None for gl in gls),wallCancelled=sum(g.buffer(.1).covers(Point(r['at'])) for r in REMOVED))
 views[viewid]=dict(key=viewid,name=name,maskPath=svg_path(g),regions=polygon_records(g),area=round(g.area/1e6,5),nodes=nodes,beams=beams,slabs=slabs,links=links,issues=issues,endSupports=caps,glBeams=gls,arcIntervals=[],zones=[zone_json(g,'O' if shared else viewid.upper(),name,'common' if shared else 'independent',nodes)] if not g.is_empty else [],summary=summary,wallCancelled=[r for r in REMOVED if g.buffer(.1).covers(Point(r['at']))])

meta=copy.deepcopy(BASE['meta']);meta.update(splitViewsVersion=2,alignOverlap=True,alignNonOverlap=ALIGNED,openingClearance=150,glPriority='GL高优先；实体梁宽查表与定GD长度',wallCancelRule='仅梁下/挂梁端部：中心到墙边距离 < 本段索引−100mm时取消；楼面沿用既定规则',overlapRule='交集保留全部梁与GL；GL优先后的上下有效梁高取最大值，共用同一套支撑坐标',sourceWidth150Rule='用户新确认：缺失梁宽向上取到存在完整索引的梁宽；150→200mm。实体宽及GD长度不变',method='差异核算范围为几何差集加一圈直接关联的完整实体梁。纯重叠视图扣除这些关联梁；关联梁在奇偶差异视图各按本层计量，仍使用公共同位坐标。几何重叠梁取GL优先后的最大有效高。',arcLengthMethod='圆弧中心线按解析弧长布点，横杆单列弦长',optimization={p['key']:dict(status='joint-geometry',provenMinimum=False,count=len(p['nodes'])) for p in fullplans})
overlay=dict(pairedCommonNodes=len(shared_keys),pairedOverlapNodes=len(shared_keys),commonArea=views['overlap']['area'],changedOverlapArea=0,oddIndependentArea=views['odd']['area'],evenIndependentArea=views['even']['area'],commonPath=svg_path(OVERLAP),changedPath='',requiredOverlapPath=svg_path(OVERLAP),actualOverlapPath=svg_path(OVERLAP),geometricOverlapRegions=polygon_records(OVERLAP),associatedBeamRegions=polygon_records(HALO),associatedBeams={k:[h['id'] for h in hs] for k,hs in RELATED.items()},zones=[z for v in views.values() for z in v['zones']])
result=dict(meta=meta,plans=fullplans,views=views,overlay=overlay,wallRemoved=REMOVED,alignmentAudit=ALIGN_AUDIT)
(ROOT/('interface-aligned.json' if ALIGNED else 'interface-independent.json')).write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),default=lambda v:v.item()),encoding='utf-8')
shared={p['key']:{k:p[k] for k in ['context','labels','walls','rejectedBeams','changes','openings','glLabels','glShapes','antiShapes','grooveShapes']} for p in fullplans}
for p in result['plans']:
 for k in shared[p['key']]:p.pop(k,None)
variants={}
for name,filename in [('independent','interface-independent.json'),('aligned','interface-aligned.json')]:
 fn=ROOT/filename
 if fn.exists():
  d=json.loads(fn.read_text(encoding='utf-8'))
  for p in d['plans']:
   for k in shared[p['key']]:p.pop(k,None)
  variants[name]=d
if len(variants)==2:
 (ROOT.parent/'boyue-site/project-data.json').write_text(json.dumps(dict(defaultMode='aligned',sharedPlans=shared,variants=variants),ensure_ascii=False,separators=(',',':'),default=lambda v:v.item()),encoding='utf-8')
print(json.dumps(dict(views={k:v['summary'] for k,v in views.items()},sharedCoordinatesEqual=True,wallCancelled=len(REMOVED)),ensure_ascii=True),flush=True)
