"""Geometry-driven stair-beam recognition for every plan, with optional DWG evidence.

No project name, model key, face ID, beam ID, world coordinate or floor number
selects a rule. Native beam material is mandatory; drawings cannot invent it.
"""
import copy,math
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union

TOL=.05
def shape(rs):return unary_union([Polygon(r['polygon'],r.get('holes',[])) for r in rs])
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def unit(a,b):
 d=[b[j]-a[j] for j in range(2)];l=math.hypot(*d);return [v/l for v in d]
def rect_axis(q):
 c=list(q.minimum_rotated_rectangle.exterior.coords)[:4];a,b=max(zip(c,c[1:]+c[:1]),key=lambda p:math.dist(*p));u=unit(a,b)
 if u[0]<-1e-8 or abs(u[0])<1e-8 and u[1]<0:u=[-v for v in u]
 n=[-u[1],u[0]];us=[dot(p,u) for p in c];ns=[dot(p,n) for p in c];lo,hi=min(us),max(us);cross=(min(ns)+max(ns))/2
 return dict(start=[u[j]*lo+n[j]*cross for j in range(2)],end=[u[j]*hi+n[j]*cross for j in range(2)],u=u,n=n,length=hi-lo,width=max(ns)-min(ns))

def detect_stair_beam_axes(raw,data):
 groups={g['id']:g for g in raw['groups']};native={g['id']:shape(g['region']) for g in raw['groups']};answer=[];pending=[]
 for plan in data['plans']:
  stairs=[z for z in plan.get('specialZones',[])+plan.get('stairRegions',[]) if z.get('kind') in ['stair-edge','stair','stair-region'] and z.get('region')]
  contexts=[dict(id=z['id'],region=shape(z['region']),axis=rect_axis(shape(z['region']))) for z in stairs]
  if not contexts:continue
  local_groups=[g for g in raw['groups'] if g['key']==plan['key']]
  # A real 3D stair boundary must meet a transverse beam. The same criterion
  # is used for drawing guides and for routes extracted directly from 3D.
  def contact(axis,material):return [c['id'] for c in contexts if abs(dot(axis['u'],c['axis']['u']))<.1 and material.distance(c['region'])<=TOL]
  drawing=[]
  for e in plan.get('drawingEvidence',[]):
   if e.get('kind')!='beam' or not e.get('region'):continue
   q=shape(e['region']);a=rect_axis(q)
   if a['length']<2*a['width'] or q.area/q.minimum_rotated_rectangle.area<.98:continue
   ids=contact(a,q)
   if not ids:continue
   axis=LineString([a['start'],a['end']])
   matches=[g for g in local_groups if native[g['id']].buffer(TOL).covers(axis) and q.intersection(native[g['id']].buffer(TOL)).area/q.area>.98]
   if not matches:
    pending.append(dict(source=e.get('source'),reason='二维楼梯梁候选缺少完整三维梁面，不生成轴线',stairRegions=ids));continue
   g=min(matches,key=lambda g:native[g['id']].area);drawing.append({**a,'groupId':g['id'],'key':plan['key'],'stairRegions':ids,'drawingHandles':[e['source']],'basis':'三维梁面完整验证；二维矩形仅辅助恢复整梁边界'})
  answer+=drawing
  # Native-only fallback: join connected parallel arms at a stair boundary,
  # intersect their transverse bands, then verify the COMPLETE native axis.
  for g in local_groups:
   rows=[]
   for b in raw['beams']:
    if b['groupId']!=g['id'] or b['path']['type']!='line':continue
    u=unit(b['start'],b['end']);a=dict(u=u)
    band=LineString([b['start'],b['end']]).buffer(b['gw']/2,cap_style=2).intersection(native[g['id']]);ids=contact(a,band)
    if ids:rows.append((b,ids))
   clusters=[]
   for b,ids in rows:
    u=unit(b['start'],b['end']);n=[-u[1],u[0]]
    hit=next((c for c in clusters if abs(dot(u,c['u']))>.99999 and abs(dot(b['start'],c['n'])-c['cross'])<=(b['gw']+c['width'])/2+TOL),None)
    if hit:hit['rows'].append((b,ids))
    else:clusters.append(dict(u=u,n=n,cross=dot(b['start'],n),width=b['gw'],rows=[(b,ids)]))
   for c in clusters:
    u,n=c['u'],c['n'];rs=[b for b,_ in c['rows']];lo=min(dot(p,u) for b in rs for p in [b['start'],b['end']]);hi=max(dot(p,u) for b in rs for p in [b['start'],b['end']]);left=max(dot(b['start'],n)-b['gw']/2 for b in rs);right=min(dot(b['start'],n)+b['gw']/2 for b in rs)
    if right-left<=TOL or hi-lo<2*(right-left):continue
    a={**c,'start':[u[j]*lo+n[j]*(left+right)/2 for j in range(2)],'end':[u[j]*hi+n[j]*(left+right)/2 for j in range(2)],'length':hi-lo,'width':right-left};axis=LineString([a['start'],a['end']])
    if not native[g['id']].buffer(TOL).covers(axis):
     pending.append(dict(groupId=g['id'],reason='楼梯梁连续性被真实空洞或实体断开，保持原分段'));continue
    if any(d['groupId']==g['id'] and abs(dot(d['u'],u))>.99999 and LineString([d['start'],d['end']]).distance(axis)<max(a['width'],d['width'])/2 for d in drawing):continue
    answer.append({k:v for k,v in a.items() if k!='rows'}|dict(groupId=g['id'],key=plan['key'],stairRegions=sorted({sid for _,ids in c['rows'] for sid in ids}),drawingHandles=[],basis='三维楼梯边界接触＋平行梁段公共宽带＋完整原生梁面连续性'))
 return answer,pending

def apply_stair_beam_rules(raw,data):
 out=copy.deepcopy(raw);axes,pending=detect_stair_beam_axes(out,data);rows=out['beams'];groups={g['id']:g for g in out['groups']};audit=[];counts={}
 for a in axes:
  g=groups[a['groupId']];axis=LineString([a['start'],a['end']]);u,n=a['u'],a['n'];cross=dot(a['start'],n)
  replaced=[b for b in rows if b['groupId']==g['id'] and b['path']['type']=='line' and abs(dot(unit(b['start'],b['end']),u))>.99999 and abs(dot(b['start'],n)-cross)<=(a['width']+b['gw'])/2+TOL and axis.buffer(max(a['width'],b['gw']),cap_style=2).buffer(TOL).covers(LineString([b['start'],b['end']]))]
  if not replaced:continue
  if max(b['bottom'] for b in replaced)-min(b['bottom'] for b in replaced)>TOL:
   pending.append(dict(groupId=g['id'],reason='楼梯梁候选存在真实梁底高差，未按同一平面强行合并'));continue
  # Physical free ends are not silently relabelled by stair recognition.
  ends=[]
  for p in [a['start'],a['end']]:
   caps=sorted([(abs(dot([q[j]-p[j] for j in range(2)],u)),e) for b in replaced for q,e in zip([b['start'],b['end']],b['ends'])],key=lambda q:q[0]);near=[e for distance,e in caps if distance<TOL]
   types={e['type'] for e in near};typ='yin' if 'yin' in types else 'yang' if types=={'yang'} else 'pending';ends.append(dict(type=typ,nativeType=typ,yinPriority=typ=='yin',at=p,evidence='保留整梁端部已有原生阴阳线证据'))
  if any(e['type']!='yin' for e in ends):pending.append(dict(groupId=g['id'],reason='楼梯候选存在阳线或端部证据不足，不自动覆盖原端部规则'));continue
  counts[g['id']]=counts.get(g['id'],0)+1;ident=g['id']+'/STAIR-'+str(counts[g['id']]).zfill(3);ids=[b['id'] for b in replaced];b=copy.deepcopy(min(replaced,key=lambda b:abs(b['gw']-a['width'])));parts=list(dict.fromkeys(p for r in replaced for p in r.get('matchedPartIds',[r['calculationPart']['id']])));rows=[r for r in rows if r['id'] not in ids]
  b.update(id=ident,path=dict(type='line',start=a['start'],end=a['end'],length=a['length'],gw=a['width']),start=a['start'],end=a['end'],length=a['length'],gw=a['width'],width=a['width'],ends=ends,calculationExempt=False,stairBeam=True,stairMaxEnd=1300,matchedFrom=ids,matchedPartIds=parts,curveSegment=False,closed=False,axisAngleDeg=math.degrees(math.atan2(u[1],u[0])),matchedJoin='自动识别楼梯边梁，恢复完整连续轴线，按整梁居中及端距1300复核',stairRecognition=dict(basis=a['basis'],stairRegions=a['stairRegions'],drawingHandles=a['drawingHandles'],nativeGroup=g['id'],fullAxisOnNativeBeam=True,projectSpecificSelection=False))
  for stale in ['review20261118','offsetRule','capCorrection','exemptionReason','reviewBaseline','nativeConnections']:b.pop(stale,None)
  b['calculationPart']={**b['calculationPart'],'exempt':False,'rule':'通用楼梯边梁整根计算'};b['caseMatch']=dict(rule='楼梯边梁通用识别',stage='楼梯空间关系→真实梁面连续性→完整中心线→整梁居中→端距复核',sideTypes=[])
  rows.append(b);audit.append(dict(id=ident,key=a['key'],groupId=g['id'],start=a['start'],end=a['end'],width=a['width'],length=a['length'],replaced=ids,evidence=b['stairRecognition']))
  for part in g['calculationParts']:
   if part['id'] in parts:part['rule']='通用楼梯整梁连续计算；局部分区不切断GTT'
 for g in out['groups']:g['routes']=[b['id'] for b in rows if b['groupId']==g['id']]
 out['beams']=rows;out['stairRecognition']=dict(version=1,scope='all-input-plans',projectSpecificSelection=False,recognized=audit,pending=pending,rule='双阴端楼梯边梁：优先居中；任一端距超过1300mm继续在相应段居中补点；保留原生几何及标高')
 return out
