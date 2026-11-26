"""Apply the user's returned 3F drawing to calculation axes, never native faces."""
from pathlib import Path
import copy,json,math,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'geometry-deps'))
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union
from shapely.affinity import scale

def geom(rs):return unary_union([Polygon(r['polygon'],r.get('holes',[])) for r in rs])
def apply_review(raw,review):
 out=copy.deepcopy(raw)
 if out.get('cadReviewRevision')==review['revision']:return out
 groups={g['id']:g for g in out['groups']};rows=out['beams'];audit=[]
 # A changed SIDE edge label is not a break in the centreline. Only the
 # original physical caps, a width/height change or a true junction may split GTT.
 changed=True
 while changed:
  changed=False
  for i,a in enumerate(rows):
   if a['path']['type']!='line' or a.get('calculationExempt'):continue
   for k in range(i+1,len(rows)):
    b=rows[k]
    if b['path']['type']!='line' or b.get('calculationExempt') or a['groupId']!=b['groupId'] or a.get('matchParent')!=b.get('matchParent') or abs(a['gw']-b['gw'])>.05 or abs(a['height']-b['height'])>.05 or a['thickness']!=b['thickness']:continue
    first,last=(a,b) if math.dist(a['end'],b['start'])<.05 else (b,a) if math.dist(b['end'],a['start'])<.05 else (None,None)
    if first is None:continue
    u=[(first['end'][j]-first['start'][j])/first['length'] for j in range(2)];v=[(last['end'][j]-last['start'][j])/last['length'] for j in range(2)]
    if sum(u[j]*v[j] for j in range(2))<.99999:continue
    if any(e.get('nativeType')!='calculation-cut' for e in [first['ends'][1],last['ends'][0]]):continue
    native=geom(groups[a['groupId']]['region'])
    if not native.buffer(.05).covers(LineString([first['start'],last['end']])):continue
    old=[a['id'],b['id']];a['start']=first['start'];a['end']=last['end'];a['ends']=[first['ends'][0],last['ends'][1]];a['length']=math.dist(a['start'],a['end']);a['path'].update(start=a['start'],end=a['end'],length=a['length']);a['matchedFrom']=list(dict.fromkeys(a.get('matchedFrom',[old[0]])+b.get('matchedFrom',[old[1]])));a['matchedPartIds']=list(dict.fromkeys(a.get('matchedPartIds',[a['calculationPart']['id']])+b.get('matchedPartIds',[b['calculationPart']['id']])));a['matchedRegion']=(a.get('matchedRegion') or [])+(b.get('matchedRegion') or []);a['matchedJoin']='修正版：同宽同高连续中心线跨侧边标签分割续接，按整根GTT计算；真实交点仍分GTT';a['review20261118']=dict(rule=a['matchedJoin'],handles=['2FD8','3085','3464']);rows.pop(k);audit.append(dict(rule='continuous-centreline',routes=old,result=a['id'],length=a['length']));changed=True;break
   if changed:break
 # A returned calculation axis can supplement missing recognition only when
 # the COMPLETE axis is covered by the existing 3D beam footprint.
 for spec in review['supplementAxes']:
  g=groups[spec['groupId']];axis=LineString([spec['start'],spec['end']]);assert geom(g['region']).buffer(.05).covers(axis),spec['id']
  template=next(b for b in rows if b['groupId']==g['id']);b=copy.deepcopy(template);b.update(id=spec['id'],start=spec['start'],end=spec['end'],length=axis.length,width=spec['width'],gw=spec['width'],height=g['height'],thickness=spec['thickness'],issues=[],calculationExempt=False,curveSegment=False,closed=False,matchedFrom=[spec['id']],matchedPartIds=[],matchedJoin=spec['rule'],cadAxisEvidence=dict(handles=spec['handles'],rule=spec['rule']),review20261118=dict(rule=spec['rule'],handles=spec['handles']))
  b['path']=dict(type='line',start=b['start'],end=b['end'],length=b['length'],gw=b['gw']);b['ends']=[dict(type='yin',nativeType='yin',yinPriority=True,at=p,evidence='修正版确认的完整梁计算端，原阴线优先') for p in [b['start'],b['end']]];b['matchedRegion']=g['region'];b.pop('offsetRule',None);b.pop('capCorrection',None);b.pop('requiresLocalBaseline',None);b['caseMatch']=dict(rule=spec['rule'],stage='用户补轴→完整三维梁面核验→交点/GTT',sideTypes=[]);rows.append(b);audit.append(dict(rule='native-verified-user-axis',result=b['id'],length=b['length']))
 for spec in review['diagonalBaselines']:
  b=next(b for b in rows if b['id']==spec['id']);u=[(b['end'][j]-b['start'][j])/b['length'] for j in range(2)];a=[spec['origin'][j]-50*u[j] for j in range(2)];native=geom(groups[b['groupId']]['region']);assert native.buffer(.05).covers(LineString([a,b['end']]))
  b['previousCalculationStart']=b['start'];b['start']=a;b['length']=math.dist(a,b['end']);b['path'].update(start=a,end=b['end'],length=b['length']);b['ends'][0].update(at=a,evidence='修正版50mm端距反推计算端，补轴全线经过三维原生梁面核验；不改实体');b['reviewBaseline']=dict(origin=a,angleDeg=b['axisAngleDeg'],confirmed=True,source='user-confirmed-CAD-return-20261118');b['review20261118']=dict(rule='斜梁以修正版端点建立独立基准，沿本梁方向50mm模数；补点仍按尽量均分，不固定图示600',handles=spec['handles'])
 # The user's left/right consistency note is resolved from equal native
 # footprints, not by blindly copying support coordinates to the other side.
 bounds=unary_union([geom(g['region']) for g in out['groups']]).bounds;cx=(bounds[0]+bounds[2])/2
 confirmed=[b for b in rows if b['id'] in {s['id'] for s in review['supplementAxes']+review['diagonalBaselines']} or b.get('cadAxisEvidence')]
 for src in confirmed:
  if src['path']['type']!='line':continue
  sg=groups[src['groupId']];mirror=scale(geom(sg['region']),xfact=-1,yfact=1,origin=(cx,0))
  targets=[g for g in out['groups'] if g['key']==sg['key'] and g['id']!=sg['id'] and abs(g['height']-sg['height'])<.05 and mirror.symmetric_difference(geom(g['region'])).area<1]
  for g in targets:
   aa=[2*cx-src['start'][0],src['start'][1]];bb=[2*cx-src['end'][0],src['end'][1]];axis=LineString([aa,bb])
   if not geom(g['region']).buffer(.05).covers(axis):continue
   if any(b['groupId']==g['id'] and b['path']['type']=='line' and axis.hausdorff_distance(LineString([b['start'],b['end']]))<.05 for b in rows):continue
   b=copy.deepcopy(src);b.update(id=g['id']+'/MIRROR-'+src['id'].split('/')[-1],key=g['key'],groupId=g['id'],sourceFace=g['sourceFace'],memberIds=g['memberIds'],bottom=g['bottom'],height=g['height'],start=aa,end=bb,length=axis.length,matchedFrom=[src['id']],matchedRegion=g['region'],matchedPartIds=[],matchedJoin='左右一致性核对：三维梁轮廓镜像完全一致，补全对应计算轴线，再独立查表及GTT布置；不复制点位',review20261118=dict(rule='镜像三维梁面完全一致，补全漏识别轴线后独立计算',sourceRoute=src['id']))
   b['path'].update(start=aa,end=bb,length=axis.length);b['axisAngleDeg']=math.degrees(math.atan2(bb[1]-aa[1],bb[0]-aa[0]));b['ends']=[{**e,'at':p} for e,p in zip(b['ends'],[aa,bb])]
   parts=sorted(g['calculationParts'],key=lambda p:axis.intersection(geom(p['region']).buffer(.05)).length,reverse=True)
   if parts:b['calculationPart']={**copy.deepcopy(parts[0]),'exempt':False,'rule':'镜像轮廓完全相同、三维核验的补充中心线'};b['matchedPartIds']=[p['id'] for p in parts if axis.intersection(geom(p['region']).buffer(.05)).length>.1]
   if src.get('reviewBaseline'):b['reviewBaseline']={**src['reviewBaseline'],'origin':[2*cx-src['reviewBaseline']['origin'][0],src['reviewBaseline']['origin'][1]],'angleDeg':b['axisAngleDeg']}
   u=[(bb[j]-aa[j])/axis.length for j in range(2)];replaced=[]
   for old in rows:
    if old['groupId']!=g['id'] or old['path']['type']!='line' or abs(old['gw']-b['gw'])>.05:continue
    v=[(old['end'][j]-old['start'][j])/old['length'] for j in range(2)];lateral=abs((old['start'][0]-aa[0])*u[1]-(old['start'][1]-aa[1])*u[0])
    if abs(sum(u[j]*v[j] for j in range(2)))>.99999 and lateral<.05 and axis.buffer(.05).intersection(LineString([old['start'],old['end']])).length/min(axis.length,old['length'])>.8:replaced.append(old['id'])
   rows=[old for old in rows if old['id'] not in replaced];b['matchedFrom']+=replaced
   rows.append(b);audit.append(dict(rule='equal-native-mirror-axis',source=src['id'],result=b['id'],replaced=replaced,mirrorX=cx))
 # Same-height GL participates in the SAME junction geometry. It does not
 # overwrite or move the independently computed GL positions.
 out['glJunctionGuides']=review['glJunctionGuides']
 out['beams']=rows;out['cadReviewRevision']=review['revision'];out['cadReview20261118']=dict(source=review['source'],sha256=review['sha256'],audit=audit,confirmedClarifications=review['confirmedClarifications'],ruleSummary=review['ruleSummary'])
 for g in out['groups']:
  g['routes']=[b['id'] for b in rows if b['groupId']==g['id']]
 out['rules'].update(continuousCentrelineAcrossSideCuts=True,slabOutOfRangeFallback150=True,stairCentreFirstMaxEnd=1300,sameHeightGLJunction=True,junctionReplacesYangEndpoint=True,cadReview='CAD-RETURN-20261118')
 return out

if __name__=='__main__':
 site=Path(__file__).resolve().parents[2];path=site/'stage1/ordinary-input.json';raw=json.loads(path.read_text('utf8'));review=json.loads((site/'stage1/cad-review-20261118.json').read_text('utf8'));result=apply_review(raw,review);from stair_beam_rules import apply_stair_beam_rules;result=apply_stair_beam_rules(result,json.loads((site/'stage1/data.json').read_text('utf8')));path.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf8');print(json.dumps(result['cadReview20261118']['audit'],ensure_ascii=False))
