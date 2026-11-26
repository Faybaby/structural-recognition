"""3D first: one continuous native plane is one beam; DWG only verifies rebates."""
from pathlib import Path
import sys,json,math,collections,hashlib
SITE=Path(__file__).resolve().parents[2];WORK=SITE.parent
sys.path[:0]=[str(WORK/'geometry-deps'),str(WORK/'solid-input/ocp')]
from shapely.geometry import Polygon,Point,LineString
from shapely.ops import unary_union
from shapely import set_precision
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_IN,TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.gp import gp_Pnt
from native_beam_geometry import explore,face_geometry,region,axes,stitch,at
from yin_partition import yin_parts,dimensions,polygons
from real_beam_overlap import qualified_overlap
def geom(z):return unary_union([Polygon(r['polygon'],r.get('holes',[])) for r in z['region']])
def point_at(path,t):
 if path['type']!='chain':return at(path,t)
 for i,p in enumerate(path['parts']):
  if t<=p['length'] or i==len(path['parts'])-1:return at(p,t)
  t-=p['length']
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'));floor=json.loads((SITE/'stage1/floor-input.json').read_text(encoding='utf8'));gl=json.loads((SITE/'stage1/beam-input.json').read_text(encoding='utf8'))
refresh=WORK/'beam-plane-refresh';dwg=json.loads((refresh/'dwg-geometry.json').read_text(encoding='utf8'));manifest=json.loads((refresh/'input-manifest.json').read_text(encoding='utf8'))
beam_groups=[];beams=[];sources=[];coverage=[];rebate_evidence=[];merges=[];junction_guides=[]
partition=dict(version=2,rule='USER-YANG-AND-REAL-BEAM-OVERLAP-20261115',zoneOverrides={},extraZones=[],floors=[],changes=[],checks=[],overlapAudit=[],slabCutConditions=['原生阳线在重合位置','与已有实际梁区发生面积重合'],shapeOnlyInference=False)
for plan in data['plans']:
 key=plan['key'];rebates=[]
 # A slab outline never seeds a beam, regardless of its width or concavity.
 for s in dwg['shapes']:
  if '企口' not in s['layer'] or len(s['points'])<2:continue
  pts=[[x-plan['drawingOffsetX'],y] for x,y in s['points']]
  if not all(-2000<=x<=39000 and -1000<=y<=18000 for x,y in pts):continue
  if s['closed'] and len(pts)>=4:
   g=Polygon(pts).buffer(0)
   if not g.is_empty:rebates.append((s,g));rebate_evidence.append(dict(key=key,source=s['source'],layer=s['layer'],region=region(g)))
 reader=STEPControl_Reader();assert reader.ReadFile(str(WORK/'solid-input'/(key+'.step'))).value==1;reader.TransferRoots();shape=reader.OneShape();faces={};classifiers=[]
 for si,solid in enumerate(explore(shape,TopAbs_SOLID,TopoDS.Solid),1):
  classifiers.append(BRepClass3d_SolidClassifier(solid))
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):faces[f'{key}-B{si}-F{fi}']=face
 def inside(p,z):
  for c in classifiers:
   c.Perform(gp_Pnt(p[0],z,-p[1]),.005)
   if c.State() in (TopAbs_IN,TopAbs_ON):return True
  return False
 byface=collections.defaultdict(list)
 for z in plan['zones']:
  if z['kind']=='beam':byface[z['face']].append(z)
 items=[]
 for face,refs in byface.items():
  native=face_geometry(faces[face]);allrefs=[z for z in plan['zones'] if z['face']==face]
  shallow=unary_union([geom(z) for z in allrefs if z['kind'] in ['slab','gl']])
  g=set_precision(native.difference(shallow),.001).buffer(0)
  if g.is_empty:continue
  items.append(dict(face=face,g=g,native=native,bottom=refs[0]['bottom'],refs=refs,allrefs=allrefs))
 parent=list(range(len(items)))
 def find(i):
  while parent[i]!=i:i=parent[i]
  return i
 for i,a in enumerate(items):
  for j,b in enumerate(items[i+1:],i+1):
   delta=abs(a['bottom']-b['bottom'])
   if delta>20.025 or a['g'].distance(b['g'])>.05:continue
   contact=a['g'].buffer(.03).intersection(b['g'].buffer(.03))
   if contact.area<.3:continue
   hits=[]
   if delta>.025:
    hits=[s['source'] for s,q in rebates if contact.intersection(q.buffer(.1)).area>.05]
    if not hits:continue
   parent[find(j)]=find(i);merges.append(dict(key=key,faces=[a['face'],b['face']],heightDifference=delta,reason='三维共面且实际相连' if delta<=.025 else '三维相邻企口台阶＋二维企口证据',rebateSources=hits))
 grouped=collections.defaultdict(list)
 for i,a in enumerate(items):grouped[find(i)].append(a)
 slabs=[(f,geom(f)) for f in floor['floors'] if f['key']==key]
 for parts in grouped.values():
  gid=key+'/PB'+str(sum(g['key']==key for g in beam_groups)+1).zfill(3);g=unary_union([a['g'] for a in parts]);dominant=max(parts,key=lambda a:a['g'].area)
  refs=[z for a in parts for z in a['refs']];allrefs=[z for a in parts for z in a['allrefs']];ids=list(dict.fromkeys(z['id'] for z in refs));otherids=list(dict.fromkeys(z['id'] for z in allrefs if z['id'] not in ids));height=max(z['geometricDepth'] for z in refs if z.get('geometricDepth'))
  members=[]
  for a in parts:
   source=dict(id=key+'-NATIVE-'+a['face'],key=key,face=a['face'],sourceFace=a['face'],bottom=a['bottom'],region=region(a['g']),memberIds=[z['id'] for z in a['allrefs']],area=a['g'].area/1e6,groupId=gid)
   members.append(source);sources.append(source)
  thicknesses=[dict(id=f['id'],thickness=f['thickness'],distance=round(q.distance(g),3)) for f,q in slabs if q.distance(g)<=300.01];thickness=max((f['thickness'] for f in thicknesses if f['thickness']),default=None)
  links=[m for m in merges if m['key']==key and set(m['faces'])<=set(a['face'] for a in parts)]
  group=dict(id=gid,key=key,memberIds=ids,relatedRegionIds=otherids,sourceFaces=[a['face'] for a in parts],sourceFace=dominant['face'],bottom=dominant['bottom'],levels=sorted(set(a['bottom'] for a in parts)),height=height,region=region(g),area=g.area/1e6,merges=links,thickness=thickness,nativeBase=plan['base'],routes=[],identification='三维连续平面为同一根梁；二维仅辅助识别企口',rebateMerged=any(m['rebateSources'] for m in links));beam_groups.append(group)
  split_parts,cuts=yin_parts(g);group['yinCuts']=cuts;group['calculationParts']=[];runs=[]
  all_primitives=axes(g,[faces[a['face']] for a in parts])
  for pi,cell in enumerate(split_parts,1):
   cw,cl=dimensions(cell)
   adjacent=[other for other in split_parts if other is not cell and cell.boundary.intersection(other.boundary).length>.1]
   is_neck=bool(cuts and adjacent and any(dimensions(q)[0]>cw+.1 for q in adjacent)) and cw<=600.025
   width_transition=is_neck or (cw<=600.025 and any(abs(dimensions(q)[0]-cw)>.1 for q in adjacent))
   exempt=is_neck and cw<=200.025
   cr=dict(id=gid+'/C'+str(pi).zfill(2),region=region(cell),width=cw,length=cl,yinNeck=is_neck,exempt=exempt,rule='WN≤200，阴线窄段免放' if exempt else '200＜WN≤300，距阳线50' if is_neck and cw<=300.025 else 'WN＞300，距阳线100' if is_neck else '普通梁阴线分段')
   group['calculationParts'].append(cr)
   if exempt:
    for ki,p in enumerate(axes(cell,[faces[a['face']] for a in parts]),1):
     local_height=max((z['geometricDepth'] for z in refs if z.get('geometricDepth') and geom(z).intersection(cell).area>.1),default=height)
     junction_guides.append(dict(id=cr['id']+'/JG'+str(ki),key=key,groupId=gid,path=p,length=p['length'],gw=round(p['gw'],3),height=local_height,start=point_at(p,0),sourceFace=group['sourceFace'],region=region(cell),bottom=group['bottom'],referenceOnly=True,reason='阴线窄段免放，仅保留几何路线辅助识别邻梁交点'))
    continue
   primitives=axes(cell,[faces[a['face']] for a in parts]);cell_runs=stitch(primitives,cell)
   # Retain analytic paths from the full native face where a concave partition
   # clips an arc/line at a genuine native阴线. No DWG seam is introduced.
   cr['routeCount']=len(cell_runs);cr['pending']=not bool(cell_runs)
   for run in cell_runs:
    run['cell']=cr;run['cellGeom']=cell;run['widthTransition']=width_transition;run['offsetRule']=None
    path=run['path']
    if is_neck and path['type']=='line':
     width=path['gw'];u=[(path['end'][j]-path['start'][j])/path['length'] for j in range(2)];n=[-u[1],u[0]];mid=at(path,path['length']/2);offset=50 if cw<=300.025 else 100
     candidates=[]
     for sign in [-1,1]:
      edge=[mid[j]+sign*n[j]*width/2 for j in range(2)];line=LineString([[at(path,t)[j]+sign*n[j]*width/2 for j in range(2)] for t in [0,path['length']]])
      boundary_score=cell.boundary.intersection(line.buffer(.035)).length
      # An actual outer edge is阳线; a newly introduced cut cannot select a side.
      outer_score=g.boundary.intersection(line.buffer(.035)).length
      candidates.append((outer_score,sign))
     candidates.sort(reverse=True);best=candidates[0]
     if best[0]>path['length']*.45 and (len(candidates)==1 or best[0]>candidates[1][0]+.1):
      shift=best[1]*(width/2-offset);path={**path,'start':[path['start'][j]+n[j]*shift for j in range(2)],'end':[path['end'][j]+n[j]*shift for j in range(2)]};run['path']=path;run['offsetRule']=dict(distance=offset,edgeSign=best[1],shift=shift,actualWidth=width)
     else:run['offsetAmbiguous']=True
    runs.append(run)
  for k,run in enumerate(runs,1):
   path=run['path'];path['gw']=round(path['gw'],3);start=point_at(path,0);end=point_at(path,path['length']);ends=[]
   for side,t in enumerate([0,path['length']]):
    p=point_at(path,t);p2=point_at(path,t+(.1 if side==0 else -.1));u=[(p[j]-p2[j])/.1 for j in range(2)];probe=[p[j]+.5*u[j] for j in range(2)];actual=[s for s in members if geom(s).buffer(.03).covers(Point(p))];bottom=min((s['bottom'] for s in actual),default=group['bottom']);samples=[inside(probe,bottom+h) for h in [-.5,.5]];branch=run['startBranch' if side==0 else 'endBranch'];connected=branch or any(samples) or run['closed']
    # Partitioning cannot turn an original native yin into a free yang end.
    # An introduced yin cut also has priority over width-transition case 2.
    native_type='yin' if connected else 'yang'
    cut_ids=[i+1 for i,c in enumerate(cuts) if LineString([c['start'],c['end']]).distance(Point(p))<=.05]
    effective_type='yin' if native_type=='yin' or cut_ids else 'yang'
    evidence=('原生端外存在实体，保留原阴线' if any(samples) else '同一梁面分支节点，保留阴线' if branch else '闭环无自由端' if run['closed'] else '分割阴线，按阴线处理' if cut_ids else '原生自由端，无阴线证据，保留阳线')
    ends.append(dict(type=effective_type,nativeType=native_type,partitionYin=bool(cut_ids),yinCutIds=cut_ids,yinPriority=True,at=p,probeXY=probe,inside=samples,branch=branch,evidence=evidence))
   bid=gid+'/R'+str(k).zfill(2);group['routes'].append(bid);issues=[]
   if not thickness:issues.append('邻域没有可靠板厚，暂不猜测查表列')
   if run.get('offsetAmbiguous'):issues.append('阴线窄段存在两个候选阳线侧，待核对，不擅自选侧')
   local_height=max((z['geometricDepth'] for z in refs if z.get('geometricDepth') and geom(z).intersection(run['cellGeom']).area>.1),default=height)
   beams.append(dict(id=bid,key=key,groupId=gid,name=gid,memberIds=ids,sourceFace=group['sourceFace'],bottom=group['bottom'],height=local_height,nativeBase=plan['base'],width=path['gw'],gw=path['gw'],thickness=thickness,slabEvidence=thicknesses,path=path,start=start,end=end,length=path['length'],ends=ends,closed=run['closed'],issues=issues,calculationPart=run['cell'],offsetRule=run.get('offsetRule'),widthTransition=run['widthTransition']))
  exempt_group=bool(group['calculationParts']) and all(c['exempt'] for c in group['calculationParts']);group['pendingParts']=[c['id'] for c in group['calculationParts'] if c.get('pending')]
  coverage.append(dict(key=key,id=gid,groupId=gid,memberIds=ids,sourceFace=group['sourceFace'],region=group['region'],bottom=group['bottom'],area=group['area'],axes=group['routes'],status='pending' if group['pendingParts'] else 'identified' if runs else 'exempt' if exempt_group else 'pending',reason='存在未提取可靠路线的阴线分区：'+','.join(group['pendingParts']) if group['pendingParts'] else '按阴线分段，梁与楼面拼接而非覆盖' if runs else '全部为WN≤200阴线窄段，免放' if exempt_group else '三维梁面未提取到可靠计算路线'))
 # Mutually exclusive plan masks: keep actual beams in projected floor overlap.
 beam_mask=unary_union([a['g'] for a in items]);gl_mask=unary_union([geom(z) for z in plan['zones'] if z['kind']=='gl']);mask=beam_mask.union(gl_mask)
 def native_yang_lines(native,bottom):
  lines=[]
  for poly in polygons(native):
   for ring in [poly.exterior,*poly.interiors]:
    pts=list(ring.coords)
    for p,q in zip(pts,pts[1:]):
     length=math.dist(p,q)
     if length<.1:continue
     mid=[(p[j]+q[j])/2 for j in range(2)];n=[-(q[1]-p[1])/length,(q[0]-p[0])/length]
     left=[mid[j]+n[j]*.5 for j in range(2)];right=[mid[j]-n[j]*.5 for j in range(2)]
     il,ir=native.covers(Point(left)),native.covers(Point(right))
     if il==ir:continue
     inner,outer=(left,right) if il else (right,left)
     # Native convex underside edge: material above inside, empty above outside.
     if inside(inner,bottom+.5) and not inside(outer,bottom+.5):lines.append(LineString([p,q]))
  return lines
 features=[dict(face=a['face'],g=a['g'],bottom=a['bottom'],yang=native_yang_lines(a['native'],a['bottom'])) for a in items]
 for b in gl['beams']:
  if b['key']!=key:continue
  features.append(dict(face=b['sourceFace'],g=geom(b),bottom=b['bottom'],yang=native_yang_lines(face_geometry(faces[b['sourceFace']]),b['bottom'])))
 floor_masks={}
 for z in [z for z in plan['zones'] if z['kind']=='slab']:
  slab=geom(z);approved=[];evidence=[]
  for a in features:
   if slab.distance(a['g'])>.05:continue
   overlap,reason=qualified_overlap(slab,a['g'],a['yang'])
   if not overlap.is_empty:
    approved.append(overlap);evidence.append(dict(beamFace=a['face'],beamBottom=a['bottom'],overlapArea=overlap.area/1e6,hasNativeYang=True,reason=reason))
  floor_masks[z['id']]=unary_union(approved)
  partition['overlapAudit'].append(dict(key=key,id=z['id'],sourceFace=z['face'],applied=bool(approved),removedArea=floor_masks[z['id']].area/1e6,evidence=evidence,reason='阳线且实际梁面积重合，两项同时满足' if approved else '未同时满足阳线与实际梁重合，保留完整楼面'))
 face_masks={a['face']:a['g'] for a in items}
 for z in plan['zones']:
  if z['kind']=='slab':q=geom(z).difference(floor_masks[z['id']])
  elif z['kind']=='beam':q=geom(z).intersection(face_masks.get(z['face'],geom(z)))
  else:continue
  partition['zoneOverrides'][z['id']]=dict(region=region(q),area=q.area/1e6,partitionRule=partition['rule'])
 for a in items:
  old=unary_union([geom(z).intersection(a['g']) for z in a['allrefs'] if z['kind']=='beam']);remaining=a['g'].difference(old)
  if remaining.area>.1:
   ref=a['refs'][0];ident=key+'-YIN-'+a['face'].split('-')[-1]
   group=next(g for g in beam_groups if g['key']==key and a['face'] in g['sourceFaces']);group['memberIds'].append(ident)
   partition['extraZones'].append(dict(key=key,id=ident,kind='beam',face=a['face'],bottom=a['bottom'],top=max(z['top'] for z in a['refs']),geometricDepth=max(z['geometricDepth'] for z in a['refs']),region=region(remaining),area=remaining.area/1e6,at=[remaining.representative_point().x,remaining.representative_point().y,a['bottom']],sources=ref.get('sources',[]),labels=ref.get('labels',[]),hasArc=ref.get('hasArc',False),evidence='三维梁区与楼面区按阴线拼接；保留真实底面标高',status='按梁计算',partitionRule=partition['rule']))
 for f in floor['floors']:
  if f['key']!=key:continue
  cut=unary_union([floor_masks.get(ident,Polygon()) for ident in f['memberIds']]);q=geom(f).difference(cut);holes=[]
  for r in region(q):
   for h in r['holes']:
    ds=dimensions(Polygon(h));holes.append(dict(id='H'+str(len(holes)+1).zfill(2),polygon=h,width=ds[0],length=ds[1],small=all(d<1000-.001 for d in ds)))
  record={**f,'region':region(q),'holes':holes,'area':q.area/1e6,'members':[{**m,'region':region(geom(m).difference(cut))} for m in f['members']],'partitionRule':partition['rule'],'beamExclusions':region(cut),'originalRegion':f['region'],'slabCutEvidence':[a for a in partition['overlapAudit'] if a['key']==key and a['id'] in f['memberIds']]}
  if not q.is_empty:partition['floors'].append(record)
  delta=geom(f).area-q.area
  if delta>.1:partition['changes'].append(dict(key=key,sourceRegion=f['id'],type='楼面扣除真实梁区',removedArea=delta/1e6,beforeArea=geom(f).area/1e6,afterArea=q.area/1e6))
 partition['checks'].append(dict(key=key,beamSlabOverlapArea=sum(geom(f).buffer(-.05).intersection(mask.buffer(-.05)).area for f in partition['floors'] if f['key']==key),beamArea=beam_mask.area/1e6,requiresBothYangAndRealBeamOverlap=True))
effective={p['key']:[{**z,**partition['zoneOverrides'].get(z['id'],{})} for z in p['zones']]+[z for z in partition['extraZones'] if z['key']==p['key']] for p in data['plans']}
for key,zs in effective.items():
 other=unary_union([geom(z) for k,others in effective.items() if k!=key for z in others])
 for z in zs:
  q=geom(z);patch=dict(commonRegion=region(q.intersection(other)),exclusiveRegion=region(q.difference(other)))
  if z['id'] in partition['zoneOverrides']:partition['zoneOverrides'][z['id']].update(patch)
  else:
   for extra in partition['extraZones']:
    if extra['id']==z['id']:extra.update(patch)
out=dict(version=3,storyHeight=gl['storyHeight'],source=gl['source'],index=gl['index'],groups=beam_groups,sources=sources,beams=beams,coverage=coverage,rebateEvidence=dict(file=manifest,features=rebate_evidence,merges=merges),rules=dict(scope='三维优先、二维辅助；按阴线分段，梁板拼接而非覆盖',geometryAuthority='original-native-face',drawingMaySplitBeams=False,yinSplitsCalculation=True,neckExemptMaxInclusive=200,neckOffset50MaxInclusive=300,neckOffsetLarge=100,slabBeamMutuallyExclusive=True,widthTransitionCase=2,nativeYinPreserved=True,yinPriority=True,widthTransitionMayOverrideYin=False,rebateMayMergeFaces=True,rebateMaxStep=20,intersectionHeightDifferenceExclusive=100,intersectionModulusConflict='allow-true-junction-flag-no-displacement',modulus=50,gllSmall=[100,130],gllLarge=[50,80],gllLargePreferred=50,longEndMin=500,longEndMaxDeduction=100,height='maximum-native-depth-within-one-beam',arcSpacing='exact-continuous-centerline-arc-length',positionsOnly=True),preservedInputs={n:hashlib.sha256((SITE/'stage1'/n).read_bytes()).hexdigest() for n in ['data.json','floor-input.json','beam-input.json']})
out['junctionGuides']=junction_guides
out['rules'].update(slabCutRequiresBothYangAndActualBeamOverlap=True,slabOutlineNeverCreatesBeam=True)
from cad_return_rules import apply_cad_rules
out=apply_cad_rules(out,data)
from prepare_beam_edge_labels import build_edge_evidence
from match_split_beams import match_parts
edge_evidence=build_edge_evidence(out)
(SITE/'stage1/ordinary-edge-input.json').write_text(json.dumps(edge_evidence,ensure_ascii=False,separators=(',',':')),encoding='utf8')
out=match_parts(out,edge_evidence,data)
from cad_review_20261118 import apply_review
review_path=SITE/'stage1/cad-review-20261118.json'
if review_path.exists():out=apply_review(out,json.loads(review_path.read_text(encoding='utf8')))
from stair_beam_rules import apply_stair_beam_rules
out=apply_stair_beam_rules(out,data)
(SITE/'stage1/ordinary-input.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(SITE/'stage1/partition-input.json').write_text(json.dumps(partition,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps(dict(nativeFaces=len(sources),beams=len(beam_groups),routes=len(beams),rebateMerges=sum(bool(m['rebateSources']) for m in merges),coplanarMerges=sum(not m['rebateSources'] for m in merges),types=dict(collections.Counter(b['path']['type'] for b in beams)),pending=sum(c['status']=='pending' for c in coverage)),ensure_ascii=False))
