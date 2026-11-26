"""Independent provenance and native B-rep checks for stage 1, not a support layout test."""
from pathlib import Path
import json,sys,hashlib,math
root=Path(__file__).parent;work=root.parent
sys.path[:0]=[str(work/'solid-input/ocp'),str(work/'geometry-deps')]
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_IN,TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.gp import gp_Pnt
from shapely.geometry import Polygon
from shapely.ops import unary_union
data=json.loads((root/'stage1-data.json').read_text(encoding='utf8'))
dwg=json.loads((root/'dwg-geometry.json').read_text(encoding='utf8'))
def explore(shape,kind,cast):
 ex=TopExp_Explorer(shape,kind)
 while ex.More():yield cast(ex.Current());ex.Next()
def geom(regions):return unary_union([Polygon(r['polygon'],r['holes']) for r in regions if len(r['polygon'])>2])
checks=[];nativepoints=0;changed=[]
for f in data['inputs']:
 actual=hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()
 if actual!=f['sha256']:changed.append(dict(file=Path(f['path']).name,loadedSha256=f['sha256'],currentSha256=actual))
 if f['path'].lower().endswith('.sldprt'):
  plan=next(p for p in data['plans'] if p['file']==Path(f['path']).name)
  cached=json.loads((work/'solid-input'/(plan['key']+'-native.json')).read_text(encoding='utf8'))
  assert cached['sha256']==f['sha256']
 else:assert hashlib.sha256((root/'new-input.bak').read_bytes()).hexdigest()==f['sha256']
 checks.append('Loaded source snapshot hash: '+Path(f['path']).name)
assert data['sequence']==['even','odd','even']
assert [i['offset'] for i in data['instances']]==[0,3000,6000]
assert [i['displayMainLevel'] for i in data['instances']]==[3000,6000,9000]
checks.append('Three instances: even / odd / even, native story translation 0 / 3000 / 6000 mm')
sources={x['source'] for x in dwg['shapes']+dwg['texts']}
for plan in data['plans']:
 reader=STEPControl_Reader();assert reader.ReadFile(str(work/'solid-input'/(plan['key']+'.step'))).name=='IFSelect_RetDone';reader.TransferRoots();faces={}
 for si,solid in enumerate(explore(reader.OneShape(),TopAbs_SOLID,TopoDS.Solid),1):
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):faces[f"{plan['key']}-B{si}-F{fi}"]=face
 for zone in plan['zones']+plan['unmatched']+plan.get('excluded',[]):
  face=faces[zone['face']];polygon=geom(zone['region']);assert polygon.is_valid and not polygon.is_empty
  assert abs(polygon.area/1e6-zone['area'])<.00002
  points=[zone['sourceXYZ']]
  for r in zone['region']:
   for ring in [r['polygon']]+r['holes']:
    points.extend([x,zone['bottom'],-y] for x,y in ring[::max(1,len(ring)//8)])
  for point in points:
   classifier=BRepClass_FaceClassifier(face,gp_Pnt(*point),.06);assert classifier.State() in [TopAbs_IN,TopAbs_ON],(zone['id'],point,classifier.State());nativepoints+=1
  for s in zone['sources']:assert s['source'] in sources
  for label in zone['labels']:assert label['source'] in sources
  if zone['top'] is not None:assert abs(zone['top']-zone['bottom']-zone['geometricDepth'])<.001
  if zone['kind'] not in ['unmatched','excluded']:
   common,exclusive=geom(zone['commonRegion']),geom(zone['exclusiveRegion'])
   assert common.difference(polygon).area<1
   assert exclusive.difference(polygon).area<1
   assert polygon.symmetric_difference(common.union(exclusive)).area<5
 for r in plan['drawingEvidence']:assert r['source'] in sources
 if data.get('planeStairsApplied'):
  assert len(plan['excluded'])==2 and all(z['participatesInCalculation'] is False for z in plan['excluded'])
  assert len(plan['specialZones'])==2
  for group in plan['classGroups']:
   assert all(link['deltaHeight']<=20.001 for link in group['links'])
  for zone in plan['specialZones']:
   face=faces[zone['face']];quad=zone['nativeVertices'];a,b,c,d=quad
   assert abs(math.dist(a,d)-150)<.00002 and abs(math.dist(b,c)-150)<.00002
   assert abs(math.dist(a,b)-zone['actualLength'])<.00002
   assert zone['actualLength']>zone['planLength']
   assert abs(zone['area']-zone['actualLength']*150/1e6)<.000001
   assert zone['kind']=='stair-edge' and zone['calculationCategory']=='stair-yangline'
   for u in [0,.25,.5,.75,1]:
    for v in [0,.5,1]:
     q=[a[j]+u*(b[j]-a[j])+v*(d[j]-a[j]) for j in range(3)]
     assert BRepClass_FaceClassifier(face,gp_Pnt(*q),.06).State() in [TopAbs_IN,TopAbs_ON]
     nativepoints+=1
 checks.append(plan['key']+': all region locations and sampled boundaries are on original native faces; all evidence handles exist in fresh DWG')
 assert len(plan['zones'])==plan['summary']['identifiedRegions']
assert not any(k in data for k in ['nodes','links','indexRows','rods'])
assert all(not any(k in p for k in ['nodes','links','indexRows','rods']) for p in data['plans'])
checks.append('No support node, spacing table, rod, or GD layout arrays present')
from classification_rules import fingerprint
rules=json.loads((root/'classification-overrides.json').read_text(encoding='utf8'))
for target in rules['targets']:
 plan=next(p for p in data['plans'] if p['key']==target['plan'])
 zone=next(z for z in plan['zones'] if z['id']==target['id'])
 assert zone['kind']=='beam' and zone['calculationCategory']=='beam' and zone['originalKind']=='slab'
 assert fingerprint(zone['region'])==target['regionSha256'] and zone['face']==target['face']
 assert zone['geometricDepth']==700
assert len(rules['targets'])==21
assert sum(z.get('classificationRule') is not None for p in data['plans'] for z in p['zones'])==21
assert all(z['kind']=='slab' for p in data['plans'] for z in p['zones'] if z.get('originalKind') is None and z['kind']=='slab' and z['geometricDepth']<=150)
checks.append('21 reviewed edge/downstand regions use beam calculation category with unchanged exact geometry; 32 instances across even / odd / even')
if data.get('planeStairsApplied'):
 assert data['planeStairRules']['inclusive'] and data['planeStairRules']['maxStep']==20
 assert any(link['deltaHeight']==20 for p in data['plans'] for g in p['classGroups'] for link in g['links'])
 assert next(z for z in data['plans'][0]['zones'] if z['id']=='even-U011')['kind']=='slab'
 for p in data['plans']:
  assert not p['unmatched']
  assert all(z['id'] not in {q['id'] for q in p['excluded']} for z in p['zones'])
 checks.append('Inclusive 20mm class links retain original native levels; stair non-beam faces excluded before propagation; 4 real slope strips have 150mm inward width, checked on native B-rep')
result={'passed':True,'liveInputsUnchanged':not changed,'changedOriginalFiles':changed,'nativeFacePointsVerified':nativepoints,'checks':checks,'limits':['本次基于网页已载入的模型版本修正分类；本地已修改的偶数层文件尚未重新导入','承托区域识别，不代表型号、间距、固顶中心或数量已计算','尺寸文字只作为附近候选；未匹配区域单独保留','叠加层是文件实例，不擅自绑定实际建筑层号']}
data['inputSnapshotStatus']={'liveInputsUnchanged':not changed,'changedFiles':changed,'message':'当前网页按已载入模型版本显示。本地偶数层SLDPRT已有更新，本次仅修正分类，尚未重新导入该文件。' if changed else '已载入模型与本地原文件一致'}
(root/'stage1-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(root/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=True))
