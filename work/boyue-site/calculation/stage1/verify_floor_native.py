"""Independent Shapely/native STEP check of every accepted actual-baseline point."""
from pathlib import Path
import sys,json,math,hashlib
ROOT=Path(__file__).parent;WORK=ROOT.parent;SITE=WORK/'boyue-site'
sys.path[:0]=[str(WORK/'solid-input/ocp'),str(WORK/'geometry-deps')]
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_IN,TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.gp import gp_Pnt
input=json.loads((SITE/'stage1/floor-input.json').read_text(encoding='utf8'))
out=json.loads((WORK.parent/'outputs/楼面支撑_实际基准计算结果.json').read_text(encoding='utf8'))
def geom(f):return unary_union([Polygon(r['polygon'],r['holes']) for r in f['region']])
def explore(s,k,c):
 ex=TopExp_Explorer(s,k)
 while ex.More():yield c(ex.Current());ex.Next()
faces={};verified=0
for key in ['even','odd']:
 reader=STEPControl_Reader();reader.ReadFile(str(WORK/'solid-input'/(key+'.step')));reader.TransferRoots()
 for si,solid in enumerate(explore(reader.OneShape(),TopAbs_SOLID,TopoDS.Solid),1):
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):faces[f'{key}-B{si}-F{fi}']=face
maps={r['id']:r for r in out['floors']};floors={r['id']:r for r in input['floors']}
for r in out['floors']:
 if r['status']!='passed':assert not r['nodes'];continue
 floor=floors[r['id']];g=geom(floor);sx,sy=r['index']['sx'],r['index']['sy']
 assert r['index'] in input['index']
 for n in r['nodes']:
  p=Point(n['world']);assert g.covers(p)
  assert BRepClass_FaceClassifier(faces[n['sourceFace']],gp_Pnt(n['world'][0],n['sourceHeight'],-n['world'][1]),.06).State() in [TopAbs_IN,TopAbs_ON]
  a=math.radians(r['base']['angleDeg']);dx=n['world'][0]-r['base']['origin'][0];dy=n['world'][1]-r['base']['origin'][1]
  u=dx*math.cos(a)+dy*math.sin(a);v=-dx*math.sin(a)+dy*math.cos(a)
  assert abs(u/50-round(u/50))<1e-7 and abs(v/50-round(v/50))<1e-7
  for h in floor['holes']:
   hole=Polygon(h['polygon']);assert not hole.covers(p)
   if not h['small'] and not(max(h['width'],h['length'])>=1000 and min(h['width'],h['length'])>=800):assert p.distance(hole)>=150-.00001
  verified+=1
 for h,spacing in zip([] if r.get('connectedHole') else (r['h'] or []),[sx,sx,sy,sy]):assert h>=500-1e-5 and h<spacing-100
 for xs,s in ([] if r.get('splitParts') else [(r['x'],sx),(r['y'],sy)]):assert all((0<b-a<=s+1e-6) if r.get('connectedHole') else abs(b-a-s)<1e-6 for a,b in zip(xs,xs[1:]))
 for c in r['rowChecks']:assert (c.get('startBoundaryException') or c['h1']>=500-1e-5) and (c.get('endBoundaryException') or c['h2']>=500-1e-5) and c['h1']<sx-100 and c['h2']<sx-100
 for c in r['columnChecks']:assert (c.get('startBoundaryException') or c['h1']>=500-1e-5) and (c.get('endBoundaryException') or c['h2']>=500-1e-5) and c['h1']<sy-100 and c['h2']<sy-100
 for h in r['holeChecks']:
  if h['small']:assert h['a1']>150 or h['a2']>150
for group in input['overlapGroups']:
 for pair in group['pairs']:
  a,b=maps[pair['a']],maps[pair['b']]
  if a['status']!='passed' or b['status']!='passed':continue
  ga,gb=geom(floors[a['id']]),geom(floors[b['id']]);aa={tuple(round(v,3) for v in n['world']) for n in a['nodes']};bb={tuple(round(v,3) for v in n['world']) for n in b['nodes']}
  for n in a['nodes']:
   if gb.covers(Point(n['world'])):assert tuple(round(v,3) for v in n['world']) in bb
  for n in b['nodes']:
   if ga.covers(Point(n['world'])):assert tuple(round(v,3) for v in n['world']) in aa
report={'passed':True,'nativeSupportPointsVerified':verified,'actualBaseline':out['actualBaseline'],'summary':out['summary'],'layerPointCounts':{key:sum(len(r['nodes']) for r in out['floors'] if r['key']==key) for key in ['even','odd']},'checks':['全部通过点在原生STEP实际承托面上','固定Sx/Sy与索引行完全一致','轴线50模数','严格四边与逐行列端距','洞口实体外及净距','共同区域真实XY同位','待处理不产生正式点位'],'modelSnapshot':'网页已载入几何版本；本地后续模型修改未自动导入'}
(SITE/'calculation/stage1/floor-native-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
