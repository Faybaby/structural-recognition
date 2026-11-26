"""Confirmed <=20 mm connected class rules and native stair-edge calculation strips.

All coordinates refer to the loaded model snapshot. Never flatten native heights.
Stair exclusions have priority over class propagation.
"""
from pathlib import Path
import sys,json,math,copy
WORK=Path(__file__).parent.parent
sys.path[:0]=[str(WORK/'solid-input/ocp'),str(WORK/'geometry-deps')]
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from shapely import set_precision
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_EDGE,TopAbs_REVERSED,TopAbs_IN,TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface,BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Plane,GeomAbs_Line
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.gp import gp_Pnt

RULE='USER-COPLANAR-STEP-LE20-20261111'
STAIR_RULE='USER-STAIR-YANGLINE-150-INWARD-20261111'
EXCLUDED={'even':{'even-U009','even-U010'},'odd':{'odd-U003','odd-U004'}}
SLAB_SEED={'even':{'even-U011'},'odd':set()}
FLIGHTS={'even':[(2,661,-9550),(2,681,-9650)],'odd':[(1,653,-9550),(1,635,-9650)]}
def geom(z):return unary_union([Polygon(r['polygon'],r.get('holes',[])) for r in z['region'] if r['polygon']])
def region(g):
 parts=[g] if g.geom_type=='Polygon' else list(getattr(g,'geoms',[]))
 return [dict(polygon=[[round(x,3),round(y,3)] for x,y in list(p.exterior.coords)[:-1]],holes=[[[round(x,3),round(y,3)] for x,y in list(r.coords)[:-1]] for r in p.interiors]) for p in parts if p.geom_type=='Polygon' and not p.is_empty]
def explore(s,k,cast):
 ex=TopExp_Explorer(s,k)
 while ex.More():yield cast(ex.Current());ex.Next()
def family(kind):return 'beam' if kind in ['beam','gl'] else kind
def close(a,b,ga,gb):
 if abs(a['bottom']-b['bottom'])>20.001:return False
 aa,bb=ga.bounds,gb.bounds
 if aa[0]>bb[2]+.06 or bb[0]>aa[2]+.06 or aa[1]>bb[3]+.06 or bb[1]>aa[3]+.06:return False
 return ga.distance(gb)<.06 and ga.boundary.intersection(gb.boundary.buffer(.04)).length>.2
def classify(z,kind,refs,mode):
 z['originalKind']='unmatched';z['kind']=kind;z['calculationCategory']=family(kind)
 z['groupingRule']=RULE;z['groupingMode']=mode
 z['referenceRegions']=[dict(id=r['id'],face=r['face'],bottom=r['bottom'],kind=r['kind'],deltaHeight=round(abs(z['bottom']-r['bottom']),3)) for r in refs]
 z['referenceSources']=list({s['source']:s for r in refs for s in r.get('sources',[])}.values())
 z['classificationBasis']='按用户确认：同一承托平面，或相邻高差≤20mm的同类构件归入同一类别；保持各自真实标高。'
 z['evidence']='原生承托面 + '+('用户圈图确认的同标高楼面' if mode=='user-coplanar-slab' else '相邻同类承托面，高差不超过20mm（含20mm）')
 z['status']='已按同平面/≤20mm台阶规则归类'
 z['notes']=[z['classificationBasis'],'本步只统一类别与计算归属，不抹平台阶、不填补洞口。']
 if kind=='slab':
  z['calculationThicknessReference']=[dict(id=r['id'],thickness=r['geometricDepth']) for r in refs if r.get('geometricDepth') in [100,120,150]]
  z['notes'].append('楼面厚度保留参考楼面的板厚依据；局部墙或反坎顶高不直接作为板厚。')
def stair_strip(plan,solid,face,fi,index,edge_z):
 surface=BRepAdaptor_Surface(face);assert surface.GetType()==GeomAbs_Plane
 normal=surface.Plane().Axis().Direction();n=[normal.X(),normal.Y(),normal.Z()]
 candidates=[]
 for edge in explore(face,TopAbs_EDGE,TopoDS.Edge):
  curve=BRepAdaptor_Curve(edge)
  if curve.GetType()!=GeomAbs_Line:continue
  a=curve.Value(curve.FirstParameter());b=curve.Value(curve.LastParameter());aa=[a.X(),a.Y(),a.Z()];bb=[b.X(),b.Y(),b.Z()]
  if abs(aa[2]-edge_z)<.02 and abs(bb[2]-edge_z)<.02 and abs(aa[0]-bb[0])>1000 and abs(aa[1]-bb[1])>100:
   candidates.append((a.Distance(b),aa,bb))
 assert candidates,(plan['key'],fi,'missing actual stair edge')
 length,a,b=max(candidates);d=[(y-x)/length for x,y in zip(a,b)];cross=[n[1]*d[2]-n[2]*d[1],n[2]*d[0]-n[0]*d[2],n[0]*d[1]-n[1]*d[0]];norm=math.sqrt(sum(x*x for x in cross));cross=[x/norm for x in cross];mid=[(x+y)/2 for x,y in zip(a,b)]
 valid=lambda p:BRepClass_FaceClassifier(face,gp_Pnt(*p),.06).State() in [TopAbs_IN,TopAbs_ON]
 if not valid([x+y for x,y in zip(mid,cross)]):cross=[-x for x in cross]
 assert valid([x+y for x,y in zip(mid,cross)])
 quad=[a,b,[x+150*y for x,y in zip(b,cross)],[x+150*y for x,y in zip(a,cross)]]
 for q in quad+[[(quad[0][j]+quad[2][j])/2 for j in range(3)]]:assert valid(q),(plan['key'],fi,q)
 # These native flights have a horizontal transverse direction: plan width is also 150.
 assert abs(cross[1])<1e-6
 poly=[[round(q[0],5),round(-q[2],5)] for q in quad];g=Polygon(poly);center=g.centroid;loc=[(quad[0][j]+quad[2][j])/2 for j in range(3)]
 return dict(id=plan['key']+'-Y'+str(index).zfill(3),kind='stair-edge',face=f"{plan['key']}-B{solid}-F{fi}",calculationCategory='stair-yangline',participatesInCalculation=True,width=150,inward=True,actualLength=round(length,5),planLength=round(math.hypot(a[0]-b[0],a[2]-b[2]),5),area=round(length*150/1e6,6),planArea=round(g.area/1e6,6),bottom=min(q[1] for q in quad),top=max(q[1] for q in quad),geometricDepth=None,region=[dict(polygon=poly,holes=[])],nativeVertices=[[round(v,6) for v in q] for q in quad],nativeEdge=[a,b],at=[center.x,center.y,loc[1]],sourceXYZ=loc,sources=[],labels=[],hasArc=False,groupingRule=STAIR_RULE,classificationBasis='按用户确认：沿实际楼梯阳线，向楼梯实体侧取150mm宽矩形，作为单独计算类别。',evidence='原生STEP楼梯斜底面与真实直线边；四角及中心已核对在实体面上',status='楼梯阳线150mm宽独立计算区',notes=['长度同时保留三维实际斜长和水平投影长。矩形贴合原生斜面，未水平铺平。','阳线计算区单列；楼梯梯板本体与被排除的小面不参与普通楼面计算。'])
def apply_plane_stairs(data):
 assert not data.get('planeStairsApplied'),'Apply only to unmodified stage-one extraction'
 report=[]
 for plan in data['plans']:
  cache=json.loads((WORK/'solid-input'/(plan['key']+'-native.json')).read_text(encoding='utf8'));assert cache['sha256']==plan['sha256']
  plan['excluded']=[]
  for z in plan['unmatched']:
   if z['id'] in EXCLUDED[plan['key']]:
    w=copy.deepcopy(z);w.update(kind='excluded',originalKind='unmatched',participatesInCalculation=False,calculationCategory=None,status='楼梯局部排除，不参与计算',classificationBasis='按用户圈图：楼梯位置保留梁参与计算；该非梁小面排除。',evidence='用户圈定楼梯范围；原生小面及边界保留供复核');plan['excluded'].append(w)
  assert len(plan['excluded'])==2
  pending=[z for z in plan['unmatched'] if z['id'] not in EXCLUDED[plan['key']]];geoms={z['id']:geom(z) for z in plan['zones']+pending}
  # The isolated room in screenshot 2 is explicitly confirmed as the same floor plane.
  for z in list(pending):
   if z['id'] not in SLAB_SEED[plan['key']]:continue
   refs=[r for r in plan['zones'] if r['kind']=='slab' and abs(r['bottom']-z['bottom'])<.01 and abs(r['geometricDepth']-z['geometricDepth'])<.01]
   assert refs;refs.sort(key=lambda r:geoms[r['id']].distance(geoms[z['id']]))
   classify(z,'slab',refs[:1],'user-coplanar-slab');plan['zones'].append(z);pending.remove(z)
  for iteration in range(20):
   moved=[]
   for z in pending:
    refs=[r for r in plan['zones'] if close(z,r,geoms[z['id']],geoms[r['id']])]
    families={family(r['kind']) for r in refs}
    if len(families)!=1:continue
    kind='slab' if families=={'slab'} else 'gl' if all(r['kind']=='gl' for r in refs) else 'beam'
    classify(z,kind,refs,'connected-le20');moved.append(z)
   if not moved:break
   for z in moved:plan['zones'].append(z);pending.remove(z)
  plan['unmatched']=pending
  # Connected classification groups retain every native face and level separately.
  parent={z['id']:z['id'] for z in plan['zones']};links=[]
  def find(x):
   while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
   return x
  for i,z in enumerate(plan['zones']):
   for r in plan['zones'][i+1:]:
    if family(z['kind'])!=family(r['kind']) or not close(z,r,geoms[z['id']],geoms[r['id']]):continue
    parent[find(z['id'])]=find(r['id']);links.append(dict(a=z['id'],b=r['id'],deltaHeight=round(abs(z['bottom']-r['bottom']),3)))
  grouped={}
  for z in plan['zones']:grouped.setdefault(find(z['id']),[]).append(z)
  plan['classGroups']=[]
  for index,values in enumerate(sorted(grouped.values(),key=lambda zs:min(z['id'] for z in zs)),1):
   if len(values)<2:continue
   gid=plan['key']+'-G'+str(index).zfill(3);ids={z['id'] for z in values}
   for z in values:z['classGroup']=gid
   plan['classGroups'].append(dict(id=gid,category=family(values[0]['kind']),members=sorted(ids),minLevel=min(z['bottom'] for z in values),maxLevel=max(z['bottom'] for z in values),links=[l for l in links if l['a'] in ids and l['b'] in ids],rule=RULE))
  reader=STEPControl_Reader();reader.ReadFile(str(WORK/'solid-input'/(plan['key']+'.step')));reader.TransferRoots();solids=list(explore(reader.OneShape(),TopAbs_SOLID,TopoDS.Solid));plan['specialZones']=[]
  for index,(si,fi,edge_z) in enumerate(FLIGHTS[plan['key']],1):
   face=list(explore(solids[si-1],TopAbs_FACE,TopoDS.Face))[fi-1];plan['specialZones'].append(stair_strip(plan,si,face,fi,index,edge_z))
  plan['summary'].update(identifiedRegions=len(plan['zones']),slabRegions=sum(z['kind']=='slab' for z in plan['zones']),beamRegions=sum(z['kind']=='beam' for z in plan['zones']),glRegions=sum(z['kind']=='gl' for z in plan['zones']),unmatchedRegions=len(pending),coplanarClassifiedRegions=sum(z.get('groupingRule')==RULE for z in plan['zones']),stairExcludedRegions=2,stairYanglineRegions=2)
  report.append(dict(plan=plan['key'],promoted=[z['id'] for z in plan['zones'] if z.get('groupingRule')==RULE],unmatched=[z['id'] for z in pending],excluded=[z['id'] for z in plan['excluded']],yanglines=[dict(id=z['id'],face=z['face'],width=z['width'],actualLength=z['actualLength']) for z in plan['specialZones']]))
 common=set_precision(geom({'region':[r for z in data['plans'][0]['zones'] for r in z['region']]}).intersection(geom({'region':[r for z in data['plans'][1]['zones'] for r in z['region']]})),.01)
 for plan in data['plans']:
  for z in plan['zones']:
   g=geom(z);z['commonRegion']=region(set_precision(g.intersection(common),.01));z['exclusiveRegion']=region(set_precision(g.difference(common),.01))
  for z in plan['specialZones']:z['commonRegion']=copy.deepcopy(z['region']);z['exclusiveRegion']=[]
  plan['commonArea']=round(common.area/1e6,3);plan['summary']['area']=round(unary_union([geom(z) for z in plan['zones']]).area/1e6,3);plan['summary']['hasArc']=sum(z['hasArc'] for z in plan['zones'])
 data['planeStairsApplied']=True;data['planeStairRules']=dict(maxStep=20,inclusive=True,preserveNativeHeights=True,stairEdgeWidth=150,stairEdgeDirection='toward stair solid',stairNonBeamCalculation=False,report=report)
 return report

if __name__=='__main__':
 root=Path(__file__).parent;data=json.loads((root/'plane-stairs-base.json').read_text(encoding='utf8'));report=apply_plane_stairs(data)
 (root/'stage1-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
