from pathlib import Path
import json,collections,math,hashlib
ROOT=Path(__file__).parent;ns={'__file__':str(ROOT/'recognize.py')};exec((ROOT/'recognize.py').read_text(encoding='utf8').split('ALL=[];NATIVE={}')[0],ns);globals().update({k:v for k,v in ns.items() if not k.startswith('__')})
site=ROOT.parent/'boyue-site';data=json.loads((site/'model3d-data.json').read_text(encoding='utf8'));report={'passed':True,'layers':{},'pairs':data['pairedCoordinates']};pairs=collections.defaultdict(list)
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
for p in data['plans']:
 reader=STEPControl_Reader();reader.ReadFile(str(ROOT/(p['key']+'.step')));reader.TransferRoots();faces={};physical={int(f['face'].split('-B')[1].split('-F')[0]) for f in p['features']};solids=[]
 for si,solid in enumerate(explore(reader.OneShape(),TopAbs_SOLID,TopoDS.Solid),1):
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):faces[f"{p['key']}-B{si}-F{fi}"]=face
  if si in physical:solids.append((BRepClass3d_SolidClassifier(solid),bbox(solid)))
 errors=[];floorfailed=[];holes=unary_union([Polygon(r['polygon'],r['holes']) for r in p['openings']]);features={f['id']:f for f in p['features']};seen=set()
 for n in p['nodes']:
  x,y,z=n['at'];face=faces[n['face']];ok=BRepClass_FaceClassifier(face,gp_Pnt(x,z,-y),.02).State() in [TopAbs_IN,TopAbs_ON];n['nativeFacePass']=ok
  if not ok:errors.append([n['id'],'nativeFace',n['at'],n['face']])
  if n['kind']=='slab' and holes.distance(Point(x,y))<150.09:errors.append([n['id'],'holeClearance'])
  if tuple(n['at']) in seen:errors.append([n['id'],'duplicate'])
  seen.add(tuple(n['at']))
  if n.get('shared'):pairs[n['pairId']].append((p['key'],round(x,3),round(y,3)))
  if abs(z-n['footing']['z']-n['netHeight'])>.01:errors.append([n['id'],'netHeight'])
  if n['netHeight']>3200 and not n['mandatoryBracing']:errors.append([n['id'],'bracingRequired'])
  if n.get('yang'):
   q=n['yang'];want=200+q['distance']-50*math.floor(q['distance']/50+.5)
   if abs(q['L']-want)>.001:errors.append([n['id'],'yangLength'])
 for f in p['features']:
  if f['kind']!='slab' or not f.get('rule') or f['status']=='窄跨免加':continue
  g=unary_union([Polygon(r['polygon'],r['holes']) for r in f['region']]);r=f['rule'];nodes=[n['at'][:2] for n in p['nodes'] if abs(n['at'][2]-f['bottom'])<.01 and g.buffer(.02).covers(Point(n['at'][:2]))];missing=coverage_missing(g,nodes,r['limitX'],r['limitY']);f['coverageMissing']=missing;f['checkPass']=missing<=1
  if missing>1:floorfailed.append({'feature':f['id'],'missing':missing});f['status']='楼面边界覆盖待复核';p['issues'].append({'feature':f['id'],'reason':'楼面覆盖仍有缺口，不能标为通过'})
 collisions=[];wallmask=unary_union([Polygon(r['polygon'],r['holes']) for r in p['walls']])
 for link in p['links']:
  hit=None;count=max(2,math.ceil(link['length']/25))
  for i in range(1,count):
   t=i/count;x,y,z=[a+(b-a)*t for a,b in zip(link['a'],link['b'])];pt=[x,z,-y]
   if not wallmask.covers(Point(x,y)):continue
   for classifier,bb in solids:
    if not all(bb[j]-.02<=pt[j]<=bb[j+3]+.02 for j in range(3)):continue
    classifier.Perform(gp_Pnt(*pt),.02)
    if classifier.State()==TopAbs_IN:hit=[x,y,z];break
   if hit:break
  link['nativeCollisionPass']=hit is None
  if hit:collisions.append({'a':link['nodeA'],'b':link['nodeB'],'at':hit});p['issues'].append({'feature':next(n['feature'] for n in p['nodes'] if n['id']==link['nodeA']),'reason':'横杆路径穿过三维实体，必须调整连接，禁止作为已通过横杆','at':hit})
 p['rodCollisions']=collisions
 digest=hashlib.sha256((Path('C:/Users/Administrator/Desktop/固顶选型/准备资料')/p['file']).read_bytes()).hexdigest();assert digest==p['sha256']
 report['layers'][p['key']]={'nodes':len(p['nodes']),'nativeFaceErrors':errors,'floorCoveragePending':floorfailed,'sourceUnchanged':True,'yangNodes':sum(bool(n.get('yang')) for n in p['nodes']),'netHeights':[min(n['netHeight'] for n in p['nodes']),max(n['netHeight'] for n in p['nodes'])],'rods':len(p['links']),'rodCollisions':len(collisions),'windowFootings':sum(n['kind']=='beam' and n['footing']['face'] is not None for n in p['nodes'])};report['passed'] &= not errors;p['summary']['nativeFacePass']=sum(n['nativeFacePass'] for n in p['nodes']);p['summary']['issues']=len(p['issues'])
report['pairErrors']=[k for k,rows in pairs.items() if len(rows)!=2 or rows[0][0]==rows[1][0] or rows[0][1:]!=rows[1][1:]];report['passed'] &= not report['pairErrors'];data['verification']=report
(site/'model3d-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8');(ROOT/'problem1-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True));assert report['passed']
