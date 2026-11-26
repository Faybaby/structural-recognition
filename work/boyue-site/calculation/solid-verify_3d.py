from pathlib import Path
import json,sys,hashlib,collections
ROOT=Path(__file__).parent
# Load only the native geometry/index helper definitions, without regeneration.
ns={'__file__':str(ROOT/'recognize.py')}
exec((ROOT/'recognize.py').read_text(encoding='utf-8').split('ALL=[];NATIVE={}')[0],ns)
globals().update({k:v for k,v in ns.items() if not k.startswith('__')})
data=json.loads((ROOT.parent/'boyue-site/model3d-data.json').read_text(encoding='utf-8'))
report={'passed':True,'layers':{},'pairCoordinateErrors':0,'candidateCount':0}
pairs=collections.defaultdict(list)
for p in data['plans']:
 key=p['key'];reader=STEPControl_Reader();reader.ReadFile(str(ROOT/(key+'.step')));reader.TransferRoots()
 faces={}
 for si,solid in enumerate(explore(reader.OneShape(),TopAbs_SOLID,TopoDS.Solid),1):
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):faces[f'{key}-B{si}-F{fi}']=face
 features={f['id']:f for f in p['features']};walls=unary_union([Polygon(r['polygon'],r['holes']) for r in p['walls']]);holes=unary_union([Polygon(r['polygon'],r['holes']) for r in p['openings']]);seen=set();errors=[]
 for n in p['nodes']:
  x,y,z=n['at'];f=features[n['feature']];token=tuple(round(v,3) for v in n['at'])
  if token in seen:errors.append([n['id'],'duplicate'])
  seen.add(token)
  if BRepClass_FaceClassifier(faces[n['face']],gp_Pnt(x,z,-y),.01).State() not in [TopAbs_IN,TopAbs_ON]:errors.append([n['id'],'nativeFace'])
  if holes.distance(Point(x,y))<150.24:errors.append([n['id'],'holeClearance'])
  if n['sourceXYZ']!=[x,z,-y]:errors.append([n['id'],'sourceAxis'])
  if abs(z-f['bottom'])>.01:errors.append([n['id'],'elevation'])
  if n['kind']=='beam':
   width=float(n['model'].split('X')[1]);r=index(width,n['designDepth'],f['adjacentThicknesses'],p['floorHeight'])
   if r!=n['rule']:errors.append([n['id'],'index'])
   if walls.distance(Point(x,y))<r['limit']-.01:errors.append([n['id'],'wallClearance'])
  elif slab_index(f['depth'],p['floorHeight'])!=n['rule']:errors.append([n['id'],'slabIndex'])
  if n.get('shared'):pairs[n['pairId']].append((key,round(x,3),round(y,3)))
 # Record incomplete coverage honestly in both the detail table and issue list.
 for f in p['features']:
  if f.get('checkPass') is False:f['status']='联合点位覆盖/间距待复核'
  if f['kind']=='beam' and f.get('status')=='已计算' and not f.get('nodeCount'):
   f['status']='墙边免放或无保留点，承托范围待复核'
   if not any(q['feature']==f['id'] and q['reason']==f['status'] for q in p['issues']):p['issues'].append({'feature':f['id'],'reason':f['status']})
 p['summary']['issues']=len(p['issues'])
 source=Path('C:/Users/Administrator/Desktop/固顶选型/准备资料')/p['file']
 digest=hashlib.sha256(source.read_bytes()).hexdigest()
 if digest.lower()!=p['sha256'].lower():errors.append(['source','hash changed'])
 assert p['summary']['boundaryMaxRelativeAreaError']<1e-4
 report['layers'][key]={'nodes':len(p['nodes']),'errors':errors,'sourceUnchanged':digest.lower()==p['sha256'].lower(),'nativeFacePass':len(p['nodes'])-sum(e[1]=='nativeFace' for e in errors),'slabCoveragePending':sum(f.get('checkPass') is False for f in p['features']),'reviewRecords':len(p['issues']),'sha256':digest}
 report['candidateCount']+=len(p['nodes']);report['passed'] &= not errors
for pair,rows in pairs.items():
 if len(rows)!=2 or rows[0][0]==rows[1][0] or rows[0][1:]!=rows[1][1:]:report['pairCoordinateErrors']+=1
report['sharedPairs']=len(pairs);report['passed'] &= report['pairCoordinateErrors']==0 and len(pairs)==data['pairedCoordinates']
data['verification']=report
(ROOT.parent/'boyue-site/model3d-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'recognition-report.json').write_text(json.dumps({p['key']:p['summary'] for p in data['plans']},ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True));assert report['passed']
