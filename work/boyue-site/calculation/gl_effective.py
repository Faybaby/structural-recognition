"""Resolve GL height before ordinary beam height; never use GL width for GD length."""
import copy,math,re,json
from pathlib import Path
from hanging_rectangles import enrich_sources,ROOT
from overlap_calculation import poly,clean
from shapely.geometry import Point,Polygon,LineString
from arc_geometry import beam_axis,beam_length,beam_point,edge

RULES=json.loads((ROOT.parent/'cadsrc/bin/Release/net10.0-windows/rules.json').read_text(encoding='utf-8-sig'))['Rows']
LOOKUP={(r['H'],r['W'],r['D'],r['T']):r for r in RULES}

def index_for(width,height,thicknesses):
 # User rule: widen lookup only; preserve actual width for GD and geometry.
 widths=sorted({r['W'] for r in RULES if r['W']>0 and r['W']>=width})
 rows=[]
 for w in widths:
  found=[LOOKUP.get((3000,int(w),int(height),int(t))) for t in sorted(set(thicknesses))]
  if found and all(found):
   rows=[dict(r,EntityWidth=width,LookupWidth=w,WidthRoundedUp=w!=width) for r in found];break
 if not rows or any(r is None for r in rows):return None
 return min(rows,key=lambda r:r['S'])

def all_hosts(p):
 hosts=copy.deepcopy(p['beams']);known={b['source'] for b in hosts}
 for r in p['rejectedBeams']:
  if r['source'] in known:continue
  g=poly(r['polygon']);x0,y0,x1,y1=g.bounds;w=round(min(x1-x0,y1-y0));horizontal=x1-x0>=y1-y0
  if w<50 or g.area<100 or abs(g.area-(x1-x0)*(y1-y0))>1:continue
  labels=[]
  for q in p['labels']:
   m=re.search(r'(?<!\d)(\d+)\s*[xX×*]\s*(\d+)',q['text'])
   if m and int(m[1])==w and g.distance(Point(q['at']))<300:labels.append((g.centroid.distance(Point(q['at'])),q,int(m[2])))
  if not labels:continue
  _,lab,d=min(labels,key=lambda v:v[0]);a,b=([x0,(y0+y1)/2],[x1,(y0+y1)/2]) if horizontal else ([(x0+x1)/2,y0],[(x0+x1)/2,y1])
  ts=[s['thickness'] for s in p['slabs'] if g.distance(poly(s['polygon']))<1]
  if not ts:ts=[100]
  hosts.append(dict(id='U-'+r['source'],source=r['source'],polygon=r['polygon'],a=a,b=b,width=w,depth=d,thickness=max(ts),adjacentThicknesses=sorted(set(ts)),curved=False,centerlineSegments=[edge(a,b)],centerlinePoints=[a,b],dimensionSources=[lab['source']],unknownOriginalRule=True,model='GD100X'+str(w)))
 return hosts

def gl_matches(p,hosts):
 matches=[];unmatched=[]
 for raw in p['glShapes']:
  g=poly(raw['polygon']);pts=list(g.minimum_rotated_rectangle.exterior.coords);_,a,b=max((math.dist(a,b),a,b) for a,b in zip(pts,pts[1:]));ang=math.atan2(b[1]-a[1],b[0]-a[0])
  ls=[q for q in p['glLabels'] if abs(math.sin(q['angle']-ang))<.01 and g.distance(Point(q['at']))<700]
  if not ls:continue
  q=min(ls,key=lambda q:g.centroid.distance(Point(q['at'])))
  eligible=[]
  for h in hosts:
   if h.get('curved'):continue
   angle=math.atan2(h['b'][1]-h['a'][1],h['b'][0]-h['a'][0])
   inter=g.intersection(poly(h['polygon'])).area
   if abs(math.sin(angle-ang))<.01 and inter>1:eligible.append((inter,h))
  if not eligible:unmatched.append(dict(source=raw['source'],gl=q['text'],glSource=q['source'],at=q['at'],reason='GL已识别，未唯一匹配实体梁宽与轴线'));continue
  _,h=max(eligible,key=lambda v:v[0]);line=beam_axis(h)
  projections=[line.project(Point(pt)) for pt in raw['polygon']];lo=max(0,min(projections));hi=min(beam_length(h),max(projections))
  matches.append(dict(id=p['key']+'-GL-'+raw['source'],source=raw['source'],gl=q['text'],glSource=q['source'],glHeight=q['d'],glProfileWidth=q['w'],host=h['id'],hostSource=h['source'],entityWidth=h['width'],ordinaryHeight=h['depth'],lo=lo,hi=hi,polygon=raw['polygon'],at=q['at']))
 return matches,unmatched

def effective_sections(p):
 hosts=all_hosts(p);matches,unmatched=gl_matches(p,hosts);out=[]
 for h in hosts:
  gls=[m for m in matches if m['host']==h['id']];length=beam_length(h);cuts=sorted({0,length,*[v for m in gls for v in [m['lo'],m['hi']]]})
  for lo,hi in zip(cuts,cuts[1:]):
   if hi-lo<.1:continue
   mid=(lo+hi)/2;active=[m for m in gls if m['lo']-.01<=mid<=m['hi']+.01]
   d=max(m['glHeight'] for m in active) if active else h['depth'];row=index_for(h['width'],d,h.get('adjacentThicknesses') or [h['thickness']]);a,b=beam_point(h,lo),beam_point(h,hi)
   if not h.get('curved'):
    angle=math.atan2(b[1]-a[1],b[0]-a[0]);v=[-math.sin(angle)*h['width']/2,math.cos(angle)*h['width']/2]
    g=poly([[a[0]+v[0],a[1]+v[1]],[b[0]+v[0],b[1]+v[1]],[b[0]-v[0],b[1]-v[1]],[a[0]-v[0],a[1]-v[1]]]).intersection(poly(h['polygon']))
   else:g=poly(h['polygon'])
   out.append(dict(id=p['key']+'-E'+str(len(out)+1).zfill(3),plan=p['key'],host=h,source=h['source'],lo=lo,hi=hi,g=g,depth=d,width=h['width'],thicknesses=h.get('adjacentThicknesses') or [h['thickness']],gl=active,index=row['S'] if row else None,limit=row['S']-100 if row else None,cells=[row['Cell']] if row else [],priority='GL梁高优先，实体梁宽查表' if active else '无GL覆盖，采用普通梁标注'))
 for m in matches:
  h=next(h for h in hosts if h['id']==m['host']);r=index_for(h['width'],m['glHeight'],h.get('adjacentThicknesses') or [h['thickness']]);m.update(index=r['S'] if r else None,limit=r['S']-100 if r else None,cell=r['Cell'] if r else '',lookupWidth=r['LookupWidth'] if r else None,widthRoundedUp=bool(r and r['WidthRoundedUp']),status=('梁宽向上取档' if r['WidthRoundedUp'] else '实体梁宽原档') if r else '向上查无完整索引，待补规则',model=h['model'])
 return hosts,out,matches,unmatched
