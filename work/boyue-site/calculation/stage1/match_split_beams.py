"""Match every native calculation part after splitting, before exemption/layout."""
from pathlib import Path
import copy,json,math,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/"geometry-deps"))
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union
from cad_return_rules import at
EPS=.05

def shape(rs):return unary_union([Polygon(r['polygon'],r.get('holes',[])) for r in rs])
def direction(p,t):
 if p['type']=='line':return [(p['end'][i]-p['start'][i])/p['length'] for i in range(2)]
 a=p['angle']+p['sweep']*t/p['length'];s=1 if p['sweep']>0 else -1;return [-math.sin(a)*s,math.cos(a)*s]
def side_evidence(b,edges,t):
 p=b['path'];u=direction(p,t);n=[-u[1],u[0]];mid=at(p,t);answer=[]
 for sign in [1,-1]:
  offset=sign*b['gw']/2-(b.get('offsetRule') or {}).get('shift',0);pt=[mid[i]+n[i]*offset for i in range(2)];hits=[]
  for e in edges:
   line=LineString(e['points']);d=line.distance(Point(pt))
   if d>2:continue
   v=[e['end'][i]-e['start'][i] for i in range(2)];length=math.hypot(*v)
   # Arc evidence retains the analytic edge's sampled points.
   if len(e['points'])<=2 and length and abs(sum(v[i]*u[i] for i in range(2))/length)<.98:continue
   hits.append((d,e))
  hits.sort(key=lambda h:h[0]);best=[e for d,e in hits if d<=(hits[0][0]+.02 if hits else 0)]
  types={e['type'] for e in best};typ=next(iter(types)) if len(types)==1 else 'pending'
  answer.append(dict(type=typ,edgeIds=[e['id'] for e in best],at=pt))
 return answer

def cap(b,p,edges,old=None):
 if old:return copy.deepcopy(old)
 u=direction(b['path'],0);hits=[]
 for e in edges:
  if LineString(e['points']).distance(Point(p))>.06:continue
  v=[e['end'][i]-e['start'][i] for i in range(2)];l=math.hypot(*v)
  if l and abs(sum(v[i]*u[i] for i in range(2))/l)<.2:hits.append(e)
 kinds={e['type'] for e in hits};typ='yin' if 'yin' in kinds else 'yang' if kinds=={'yang'} else 'yin'
 return dict(type=typ,nativeType=typ if kinds else 'calculation-cut',partitionYin=not bool(kinds),yinPriority=True,at=p,evidence='三维真实端边：'+typ if kinds else '分割计算端，按已确认的阴线分段规则处理；不改变原生阳线',nativeEdgeIds=[e['id'] for e in hits])

def match_parts(raw,evidence,data):
 out=copy.deepcopy(raw);groups={g['id']:g for g in out['groups']};edges={g['id']:g['boundaryEdges']+g['edges'] for g in evidence['groups']};raw_beams=copy.deepcopy(raw['beams']);rows=[];audit=[]
 for guide in raw.get('junctionGuides',[]):
  if any(b['groupId']==guide['groupId'] and b['path']==guide['path'] for b in raw_beams):continue
  g=groups[guide['groupId']];part=next(c for c in g['calculationParts'] if guide['id'].startswith(c['id']+'/'))
  template=next((b for b in raw_beams if b['groupId']==g['id']),None)
  b=copy.deepcopy(template) if template else dict(memberIds=g['memberIds'],nativeBase=g['nativeBase'],slabEvidence=[],issues=[])
  b.update(id=guide['id'],key=g['key'],groupId=g['id'],name=g['id'],path=copy.deepcopy(guide['path']),start=at(guide['path'],0),end=at(guide['path'],guide['length']),length=guide['length'],width=guide['gw'],gw=guide['gw'],height=g['height'],bottom=g['bottom'],thickness=g['thickness'],sourceFace=g['sourceFace'],calculationPart=copy.deepcopy(part),offsetRule=None,closed=False,issues=[],recoveredGuide=True,widthTransition=True,curveSegment=guide['path']['type']=='arc')
  b['ends']=[cap(b,b['start'],edges[g['id']]),cap(b,b['end'],edges[g['id']])];b.pop('calculationExempt',None);raw_beams.append(b)
 for original in raw_beams:
  es=edges[original['groupId']];p=original['path'];length=original['length']
  if p['type']=='chain':
   b=copy.deepcopy(original);b['matchedFrom']=[b['id']];b['calculationExempt']=bool(b.get('calculationExempt'));b['caseMatch']=dict(rule='原有闭环／组合弧长规则',stage='分割后匹配',sideTypes=[]);rows.append(b);continue
  stations=[0,length]
  if p['type']=='line':
   u=direction(p,0);n=[-u[1],u[0]]
   for e in es:
    v=[e['end'][i]-e['start'][i] for i in range(2)];l=math.hypot(*v)
    if not l or abs(sum(v[i]*u[i] for i in range(2))/l)<.995:continue
    for q in [e['start'],e['end']]:
     lateral=sum((q[i]-p['start'][i])*n[i] for i in range(2))
     if abs(abs(lateral+(original.get('offsetRule') or {}).get('shift',0))-original['gw']/2)>2:continue
     t=sum((q[i]-p['start'][i])*u[i] for i in range(2))
     if EPS<t<length-EPS:stations.append(t)
  stations=sorted(set(round(t,6) for t in stations));pieces=[]
  for a,z in zip(stations,stations[1:]):
   side=side_evidence(original,es,(a+z)/2);pieces.append((a,z,side,tuple(s['type'] for s in side)))
  known=[p for p in pieces if 'pending' not in p[3]];intervals=[]
  for a,z,side,sig in pieces:
   # A rebate lip or T-node gap with no physical parallel edge cannot itself
   # create a different yin/yang class. Use the nearest verified side pattern
   # only to suppress artificial cuts; source edge evidence stays in the audit.
   if 'pending' in sig and known and z-a<=max(original['gw'],50)+.05:
    near=min(known,key=lambda p:abs((p[0]+p[1]-a-z)/2));side=copy.deepcopy(near[2]);sig=near[3]
    for e in side:e['matchingContinuationOnly']=True
   if intervals and intervals[-1][3]==sig:intervals[-1]=(intervals[-1][0],z,intervals[-1][2],sig)
   else:intervals.append((a,z,side,sig))
  for k,(a,z,side,sig) in enumerate(intervals,1):
   b=copy.deepcopy(original);b['matchedFrom']=[original['id']];b['matchParent']=original['id']
   if len(intervals)>1:b['id']=original['id']+'/M'+str(k).zfill(2)
   if p['type']=='line':b['path']={**p,'start':at(p,a),'end':at(p,z),'length':z-a}
   else:b['path']={**p,'angle':p['angle']+p['sweep']*a/length,'sweep':p['sweep']*(z-a)/length,'length':z-a}
   b.update(start=at(b['path'],0),end=at(b['path'],z-a),length=z-a)
   b['ends']=[cap(b,b['start'],es,original['ends'][0] if a<EPS else None),cap(b,b['end'],es,original['ends'][1] if z>length-EPS else None)]
   old_exempt=bool(original.get('calculationExempt') or original.get('recoveredGuide') or original['calculationPart'].get('exempt'))
   both_yang=sig==('yang','yang');has_yin='yin' in sig
   exempt=old_exempt and b['gw']<=200.025 and has_yin
   unresolved=old_exempt and not exempt and not both_yang
   b['calculationExempt']=exempt;b['calculationPart']['exempt']=exempt
   if exempt:b['exemptionReason']='分割后核验存在真实阴线，WN≤200，按既有阴线窄段规则免放'
   elif both_yang and old_exempt:b['issues']=[x for x in b['issues'] if '阴线' not in x];b['restoredFromExemption']=True
   if unresolved:b['issues'].append('分割后阴阳边证据不足，保留待核对，不提前免放')
   rule='阴线窄段免放' if exempt else '两侧阳线，恢复普通梁／变宽段计算' if both_yang and old_exempt else '原有梁／挂梁端部及交点规则'
   b['caseMatch']=dict(rule=rule,stage='先分割→核验阴阳边→匹配情况→判断免放→查表→交点/GTT',sideTypes=list(sig),sideEvidence=side,previouslyExempt=old_exempt,exempt=exempt,pending=unresolved,range=[a,z])
   rows.append(b)
   if len(intervals)>1:
    g=groups[b['groupId']];g.setdefault('matchingCuts',[])
    if a>EPS:g['matchingCuts'].append(dict(at=b['start'],route=original['id'],reason='三维阴阳边类型变化处重新分段'))
 # Native T branches: continue an internal cap to the genuine centre intersection,
 # bounded by the OTHER member's half-width and covered by the native footprint.
 for i,b in enumerate(rows):
  if b['path']['type']!='line' or b['calculationExempt']:continue
  g=groups[b['groupId']];native=shape(g['region']).buffer(.05);u=direction(b['path'],0)
  for c in rows[i+1:]:
   if c['groupId']!=b['groupId'] or c['path']['type']!='line' or c['calculationExempt']:continue
   v=direction(c['path'],0);den=u[0]*v[1]-u[1]*v[0]
   if abs(den)<1e-5:continue
   d=[c['start'][k]-b['start'][k] for k in range(2)];tb=(d[0]*v[1]-d[1]*v[0])/den;hit=at(b['path'],tb);tc=sum((hit[k]-c['start'][k])*v[k] for k in range(2))
   if not (-c['gw']/2-EPS<=tb<=b['length']+c['gw']/2+EPS and -b['gw']/2-EPS<=tc<=c['length']+b['gw']/2+EPS):continue
   for row,t in [(b,tb),(c,tc)]:
    end=0 if t<-.05 else 1 if t>row['length']+.05 else None
    if end is None or row['ends'][end]['type']=='yang':continue
    old=row['start'] if end==0 else row['end']
    if not native.covers(LineString([old,hit])):continue
    row['start' if end==0 else 'end']=list(hit);row['length']=math.dist(row['start'],row['end']);row['path'].update(start=row['start'],end=row['end'],length=row['length']);row['ends'][end].update(at=list(hit),type='yin',evidence='分割后接梁处延伸至真实中心线交点，阴线优先');row.setdefault('nativeConnections',[]).append(dict(fromPoint=old,toPoint=list(hit),partner=c['id'] if row is b else b['id']))
 # Rejoin equal-width, equal-rule arms across a native T node. The true
 # intersection will split GTT in the calculation engine, not a 2D face seam.
 changed=True
 while changed:
  changed=False
  for i,b in enumerate(rows):
   if b['path']['type']!='line' or b['calculationExempt']:continue
   u=direction(b['path'],0)
   for k in range(i+1,len(rows)):
    c=rows[k]
    if c['groupId']!=b['groupId'] or c['path']['type']!='line' or c['calculationExempt'] or abs(c['gw']-b['gw'])>.05 or c['height']!=b['height'] or c['thickness']!=b['thickness']:continue
    if b['caseMatch']['sideTypes']!=c['caseMatch']['sideTypes'] or 'pending' in b['caseMatch']['sideTypes']:continue
    v=direction(c['path'],0)
    if sum(u[j]*v[j] for j in range(2))<.99999:continue
    ends=None
    if math.dist(b['end'],c['start'])<.05:ends=(b,c)
    elif math.dist(c['end'],b['start'])<.05:ends=(c,b)
    if not ends:continue
    first,last=ends
    joint=first['end']
    def crosses(q):
     if q['groupId']!=b['groupId'] or q['path']['type']!='line' or q['calculationExempt']:return False
     vq=direction(q['path'],0)
     if abs(sum(u[j]*vq[j] for j in range(2)))>.995:return False
     return LineString([q['start'],q['end']]).distance(Point(joint))<.05
    if not any(crosses(q) for q in rows):continue
    if first['ends'][1]['type']=='yang' or last['ends'][0]['type']=='yang':continue
    b['matchedPartIds']=list(dict.fromkeys(b.get('matchedPartIds',[b['calculationPart']['id']])+c.get('matchedPartIds',[c['calculationPart']['id']])))
    b['matchedFrom']+=c['matchedFrom'];b['start']=first['start'];b['end']=last['end'];b['length']=math.dist(b['start'],b['end']);b['path'].update(start=b['start'],end=b['end'],length=b['length']);b['ends']=[first['ends'][0],last['ends'][1]];b['matchedJoin']='同宽、同阴阳边模式的真实T形接头续接；交点仍单独计算GTT';rows.pop(k);changed=True;break
   if changed:break
 # Match exemption and route lists back to the SAME original region, not a new face.
 for g in out['groups']:
  rs=[b for b in rows if b['groupId']==g['id']];g['routes']=[b['id'] for b in rs]
  for part in g['calculationParts']:
   matched=[b for b in rs if part['id'] in b.get('matchedPartIds',[b['calculationPart']['id']])];part['previousExempt']=part['exempt'];part['exempt']=bool(matched) and all(b['calculationExempt'] for b in matched);part['routeCount']=len(matched);part['matchedRules']=sorted(set(b['caseMatch']['rule'] for b in matched));part['rule']='；'.join(part['matchedRules']) if matched else part['rule'];part['pending']=not matched or any(b['caseMatch'].get('pending') for b in matched)
  g['pendingParts']=[p['id'] for p in g['calculationParts'] if p.get('pending')]
  audit.append(dict(groupId=g['id'],routes=len(rs),restored=sum(b.get('restoredFromExemption',False) for b in rs),exempt=sum(b['calculationExempt'] for b in rs),cuts=g.get('matchingCuts',[])))
 # Draw each matched result on its own native material band. These masks are
 # review overlays only; point placement still checks the original B-rep face.
 for b in rows:
  p=b['path'];native=shape(groups[b['groupId']]['region'])
  if p['type']=='chain':continue
  n=max(1,math.ceil(b['length']/20));samples=[]
  for i in range(n+1):
   t=b['length']*i/n;q=at(p,t);u=direction(p,t);normal=[-u[1],u[0]];shift=(b.get('offsetRule') or {}).get('shift',0);samples.append([q[k]-normal[k]*shift for k in range(2)])
  band=native.intersection(LineString(samples).buffer(b['gw']/2,cap_style=2))
  geoms=[band] if band.geom_type=='Polygon' else [q for q in getattr(band,'geoms',[]) if q.geom_type=='Polygon']
  b['matchedRegion']=[dict(polygon=[list(p) for p in list(q.exterior.coords)[:-1]],holes=[[list(p) for p in list(r.coords)[:-1]] for r in q.interiors]) for q in geoms if q.area>.1]
  b['matchedRegionRole']='review overlay only; source B-rep geometry unchanged'
 # Adjacent slab/width/height lookup is local to each resulting segment.
 plans={p['key']:p for p in data['plans']}
 for b in rows:
  p=b['path']
  if p['type']=='chain':continue
  n=max(1,math.ceil(b['length']/30));axis=LineString([at(p,b['length']*i/n) for i in range(n+1)]);ev=[]
  for z in plans[b['key']]['zones']:
   if z['kind']!='slab' or not z.get('geometricDepth'):continue
   q=shape(z['region']);near=axis.intersection(q.buffer(b['gw']/2+300)).length
   if near>.1:ev.append(dict(id=z['id'],thickness=z['geometricDepth'],distance=round(q.distance(axis),3),adjacentLength=round(near,3)))
  if ev:b['thickness']=max(e['thickness'] for e in ev);b['slabEvidence']=ev
  b['axisAngleDeg']=math.degrees(math.atan2(*direction(p,0)[::-1])) if p['type']=='line' else None
 for item in out['coverage']:
  g=groups.get(item.get('groupId',item['id']))
  if g:
   item['axes']=g['routes'];item['status']='pending' if g['pendingParts'] else 'identified';item['reason']='分割后匹配仍有阴阳边证据待核实：'+','.join(g['pendingParts']) if g['pendingParts'] else '所有计算段已进入三维阴阳边核验与既有规则匹配'
 out['beams']=rows;out['junctionGuides']=[];out['caseMatchAudit']=audit;out['rules'].update(matchOrder='split-native-edge-then-existing-case',exemptionAfterNativeEdgeMatch=True,junctionExemptExcluded=True,allPartsMatched=True)
 return out

if __name__=='__main__':
 import subprocess
 site=Path(__file__).resolve().parents[2]
 raw=json.loads(subprocess.check_output(['git','show','1fbaefdcdd0b6abfa361af88343781bb150c4334:stage1/ordinary-input.json'],cwd=site,encoding='utf8'))
 out=match_parts(raw,json.loads((site/'stage1/ordinary-edge-input.json').read_text(encoding='utf8')),json.loads((site/'stage1/data.json').read_text(encoding='utf8')))
 (site/'stage1/ordinary-input.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8')
 print(dict(routes=len(out['beams']),restored=sum(b.get('restoredFromExemption',False) for b in out['beams']),exempt=sum(b.get('calculationExempt',False) for b in out['beams'])))
