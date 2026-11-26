"""Stage 1 only: fresh DWG evidence + unchanged native model geometry. No GD layout."""
from pathlib import Path
import sys,json,math,re,collections,base64,struct
ROOT=Path(__file__).parent;WORK=ROOT.parent
sys.path[:0]=[str(WORK/'solid-input/ocp'),str(WORK/'geometry-deps')]
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_WIRE,TopAbs_REVERSED
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface,BRepAdaptor_Curve
from OCP.BRepTools import BRepTools,BRepTools_WireExplorer
from OCP.GeomAbs import GeomAbs_Plane,GeomAbs_Line,GeomAbs_Circle
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from shapely import set_precision
def explore(shape,kind,cast):
 ex=TopExp_Explorer(shape,kind)
 while ex.More():yield cast(ex.Current());ex.Next()
def box(shape):
 b=Bnd_Box();BRepBndLib.AddOptimal_s(shape,b,False,False);a=b.CornerMin();c=b.CornerMax();return [a.X(),a.Y(),a.Z(),c.X(),c.Y(),c.Z()]
def clean(g):return set_precision(g.buffer(0),.01)
def parts(g):return [g] if g.geom_type=='Polygon' and not g.is_empty else [q for q in getattr(g,'geoms',[]) if q.geom_type=='Polygon' and not q.is_empty]
def region(g):return [dict(polygon=[[round(x,3),round(y,3)] for x,y in list(p.exterior.coords)[:-1]],holes=[[[round(x,3),round(y,3)] for x,y in list(r.coords)[:-1]] for r in p.interiors]) for p in parts(g)]
def face_polygon(face):
 outer=BRepTools.OuterWire_s(face);shell=[];holes=[];has_arc=False
 for wire in explore(face,TopAbs_WIRE,TopoDS.Wire):
  ex=BRepTools_WireExplorer(wire,face);pts=[]
  while ex.More():
   e=TopoDS.Edge(ex.Current());c=BRepAdaptor_Curve(e);u,v=c.FirstParameter(),c.LastParameter();typ=c.GetType()
   if typ==GeomAbs_Line:n=1
   elif typ==GeomAbs_Circle:
    has_arc=True;r=c.Circle().Radius();n=max(2,math.ceil(abs(v-u)/(2*math.acos(max(-1,1-.02/r)))))
   else:n=96
   q=[[c.Value(u+(v-u)*i/n).X(),-c.Value(u+(v-u)*i/n).Z()] for i in range(n+1)]
   if e.Orientation()==TopAbs_REVERSED:q.reverse()
   if pts and math.dist(pts[-1],q[0])>.05 and math.dist(pts[-1],q[-1])<.05:q.reverse()
   pts.extend(q if not pts else q[1:]);ex.Next()
  if wire.IsSame(outer):shell=pts
  else:holes.append(pts)
 return clean(Polygon(shell,holes)),has_arc
manifest=json.loads((ROOT/'input-manifest.json').read_text(encoding='utf-8-sig'))
dwg=json.loads((ROOT/'dwg-geometry.json').read_text(encoding='utf8'))
allplans=[];notes=[]
def txt(s):return re.sub(r'\\[A-Za-z][^;{}]*;','',s).replace('{','').replace('}','').strip()
for key,off,wall,floor in [('even',0,'偶数层墙柱','奇数层楼面'),('odd',160000,'奇数层墙柱','偶数层楼面')]:
 raw=json.loads((WORK/'solid-input'/(key+'-native.json')).read_text(encoding='utf8'))
 source=next(f for f in manifest if Path(f['path']).name==raw['file']);assert source['sha256']==raw['sha256']
 texts=[dict(t,text=txt(t['text']),at=[t['at'][0]-off,t['at'][1]]) for t in dwg['texts'] if -2000<=t['at'][0]-off<=39000 and -1000<=t['at'][1]<=18000]
 records=[]
 for s in dwg['shapes']:
  if not s['closed'] or s['layer'] not in ['DT-梁','S-梁','DT-板边线','DT-过梁','S-过梁','DT-窗台','DT-墙上洞口','DT-洞口','S-洞口']:continue
  pts=[[x-off,y] for x,y in s['points']]
  if len(pts)<3 or not all(-2000<=x<=39000 and -1000<=y<=18000 for x,y in pts):continue
  g=clean(Polygon(pts))
  if g.area<100:continue
  kind='slab' if s['layer']=='DT-板边线' else 'gl' if s['layer'] in ['DT-过梁','S-过梁'] else 'beam' if s['layer'] in ['DT-梁','S-梁'] else 'opening'
  label=[]
  for t in texts:
   pat=re.search(r'GL\s*[:：]?\s*(\d+)\s*[xX×*]\s*(\d+)',t['text']) if kind=='gl' else re.match(r'\s*(\d+)\s*[xX×*]\s*(\d+)',t['text']) if kind=='beam' and '梁尺寸' in t['layer'] and 'GL' not in t['text'] else None
   if not pat:continue
   distance=g.distance(Point(t['at']))
   if distance<=500:label.append(dict(source=t['source'],text=t['text'],at=t['at'],width=int(pat[1]),height=int(pat[2]),distance=round(distance,2)))
  label.sort(key=lambda q:(q['distance'],g.centroid.distance(Point(q['at']))))
  if label:label=label[:3]
  records.append(dict(id=key+'-DWG-'+s['source'],source=s['source'],layer=s['layer'],kind=kind,g=g,labels=label,arc=any(a['type']=='arc' for a in s['segments'])))
 reader=STEPControl_Reader();reader.ReadFile(str(WORK/'solid-input'/(key+'.step')));reader.TransferRoots();horizontal=[];bodymeta={}
 for si,solid in enumerate(explore(reader.OneShape(),TopAbs_SOLID,TopoDS.Solid),1):
  bb=box(solid);body=min(raw['bodies'],key=lambda b:sum(abs(x-y) for x,y in zip(bb,b['box'])));helper=any(w in body['name'] for w in ['爬架','避让','洞口']);bodymeta[body['id']]={'helper':helper,'stepBody':si}
  if helper:continue
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):
   surface=BRepAdaptor_Surface(face)
   if surface.GetType()!=GeomAbs_Plane:continue
   plane=surface.Plane();ny=plane.Axis().Direction().Y()*(-1 if face.Orientation()==TopAbs_REVERSED else 1)
   if abs(ny)<.99999:continue
   g,arc=face_polygon(face)
   if g.area<100:continue
   horizontal.append(dict(face=f'{key}-B{si}-F{fi}',g=g,z=round(plane.Location().Y(),3),up=ny>0,arc=arc))
 up=[f for f in horizontal if f['up']];down=[f for f in horizontal if not f['up']];level=max(up,key=lambda f:f['g'].area)['z'];base=max([f for f in down if f['z']<level-1000],key=lambda f:f['g'].area)['z']
 zones=[];unmatched=[];areaFloor=0
 def emit(g,f,top,kind,evidence):
  for part in parts(g):
   if part.area<100:continue
   matching=[r for r in evidence if r.get('g') is None or r['g'].intersection(part).area>1]
   labels=[q for r in matching for q in r.get('labels',[])];at=part.representative_point();confidence='二维轮廓与三维承托面重合' if any(r.get('g') is not None for r in matching) else '二维板厚文字位于三维承托面内'
   zones.append(dict(id=key+'-R'+str(len(zones)+1).zfill(3),kind=kind,face=f['face'],bottom=f['z'],top=top,geometricDepth=round(top-f['z'],3),area=round(part.area/1e6,5),region=region(part),at=[round(at.x,3),round(at.y,3),f['z']],sourceXYZ=[round(at.x,3),f['z'],-round(at.y,3)],sources=[dict(source=r['source'],layer=r['layer']) for r in matching],labels=labels,hasArc=f['arc'] or any(r.get('arc',False) for r in matching),evidence=confidence,status='需计算固顶的承托区域',notes=[],g=part))
 for f in down:
  if f['z']<=base+.1 or f['z']>=level-.01:continue
  remainder=f['g']
  for t in sorted(up,key=lambda t:t['z']):
   if t['z']<=f['z']+.1 or remainder.is_empty:continue
   g=clean(remainder.intersection(t['g']))
   if g.is_empty:continue
   remainder=clean(remainder.difference(g));left=g
   # This order classifies overlapping drawing evidence, not support-point priority.
   for kind in ['gl','beam','slab']:
    rs=[r for r in records if r['kind']==kind and r['g'].intersects(left)]
    if not rs:continue
    inter=clean(left.intersection(unary_union([r['g'] for r in rs])))
    if inter.is_empty:continue
    emit(inter,f,t['z'],kind,rs);left=clean(left.difference(inter))
   # A plate-thickness annotation actually inside a native face is evidence; no proximity guess.
   hs=[]
   for text in texts:
    m=re.search(r'\bh\s*=\s*(\d+)',text['text'],re.I)
    if m and abs(int(m[1])-(t['z']-f['z']))<.5 and left.covers(Point(text['at'])):hs.append(dict(source=text['source'],layer=text['layer'],g=None,labels=[dict(source=text['source'],text=text['text'],at=text['at'],thickness=int(m[1]))]))
   if hs and left.area>100:emit(left,f,t['z'],'slab',hs);left=Polygon()
   for part in parts(left):
    if part.area<100:continue
    rp=part.representative_point();unmatched.append(dict(id=key+'-U'+str(len(unmatched)+1).zfill(3),kind='unmatched',face=f['face'],bottom=f['z'],top=t['z'],geometricDepth=round(t['z']-f['z'],3),area=round(part.area/1e6,5),region=region(part),at=[rp.x,rp.y,f['z']],sourceXYZ=[rp.x,f['z'],-rp.y],sources=[],labels=[],status='三维有承托候选面，二维依据待确认',evidence='尚未匹配本次DWG的梁轮廓、板边线或板厚文字',hasArc=f['arc']))
  for part in parts(remainder):
   if part.area<100:continue
   rp=part.representative_point();unmatched.append(dict(id=key+'-U'+str(len(unmatched)+1).zfill(3),kind='unmatched',face=f['face'],bottom=f['z'],top=None,geometricDepth=None,area=round(part.area/1e6,5),region=region(part),at=[rp.x,rp.y,f['z']],sourceXYZ=[rp.x,f['z'],-rp.y],sources=[],labels=[],status='三维底面未配到顶面，待确认',evidence='不推测局部几何高度',hasArc=f['arc']))
 meshes=[]
 for body in raw['bodies']:
  if bodymeta.get(body['id'],{}).get('helper',True):continue
  a=body['positions'];meshes.append(dict(id=body['id'],name=body['name'],vertexCount=len(a)//3,positions=base64.b64encode(struct.pack('<'+'f'*len(a),*a)).decode()))
 support=clean(unary_union([z['g'] for z in zones]));drawing=clean(unary_union([r['g'] for r in records if r['kind'] in ['beam','gl','slab']]))
 missing2d=[]
 for r in records:
  if r['kind'] not in ['beam','gl']:continue
  fraction=r['g'].intersection(support).area/r['g'].area
  if fraction<.5:missing2d.append(dict(source=r['source'],layer=r['layer'],kind=r['kind'],matchFraction=round(fraction,4),region=region(r['g']),labels=r['labels'],reason='本次二维梁轮廓在三维可识别承托面的重合面积不足一半，需先核对模型和图纸'))
 for z in zones:
  if z['labels'] and z['kind'] in ['beam','gl']:
   nearest=z['labels'][0];z['drawingDimension']=nearest
   if nearest.get('height')!=z['geometricDepth']:z['notes'].append('二维标注高与当前局部实体高不一致；本步分别显示，不自动选较大值')
 summary=dict(identifiedRegions=len(zones),slabRegions=sum(z['kind']=='slab' for z in zones),beamRegions=sum(z['kind']=='beam' for z in zones),glRegions=sum(z['kind']=='gl' for z in zones),unmatchedRegions=len(unmatched),twoDBeamReview=len(missing2d),area=round(support.area/1e6,3),hasArc=sum(z['hasArc'] for z in zones))
 allplans.append(dict(key=key,file=raw['file'],sha256=raw['sha256'],wallType=wall,floorType=floor,drawingOffsetX=off,base=base,level=level,modelStory=level-base,sourceBox=raw['box'],meshes=meshes,zones=zones,unmatched=unmatched,twoDReview=missing2d,summary=summary,support=support,drawingEvidence=[dict(source=r['source'],layer=r['layer'],kind=r['kind'],region=region(r['g']),labels=r['labels']) for r in records],drawingLabels=[t for t in texts if t['layer'] in ['DT-梁尺寸','DT-板尺寸'] or re.search(r'GL\s*[:：]',t['text'])],drawingTitles=[t for t in dwg['texts'] if '墙柱' in t['text'] and '楼面' in t['text'] and abs(t['at'][0]-off-19000)<5000]))
common=clean(allplans[0]['support'].intersection(allplans[1]['support']))
for p in allplans:
 for z in p['zones']:
  z['commonRegion']=region(clean(z['g'].intersection(common)));z['exclusiveRegion']=region(clean(z['g'].difference(common)));z.pop('g',None)
 p['commonArea']=round(common.area/1e6,3);p.pop('support');p['drawingRegion']=region(p.pop('drawing')) if 'drawing' in p else []
instances=[];offset=0
for i,key in enumerate(['even','odd','even']):
 p=next(p for p in allplans if p['key']==key);instances.append(dict(id='L'+str(i+1),order=i+1,key=key,offset=offset,label=f'第{i+1}层模型',wallType=p['wallType'],floorType=p['floorType'],sourceMainLevel=p['level'],displayMainLevel=p['level']-p['base']+offset));offset+=p['modelStory']
out=dict(stage=1,title='三层输入与固顶支承区域识别',sequence=['even','odd','even'],inputs=manifest,instances=instances,plans=allplans,scope='只识别需要进入固顶布置计算的承托区域；不生成间距网格、固顶数量、横杆、型号或自动补点',drawingFile=Path(manifest[0]['path']).name,drawingSha256=manifest[0]['sha256'],geometryCache='SLDPRT文件哈希与原生几何缓存逐一一致；只复用几何，不复用旧点位或旧判定',boundaryChordError=.02)
from classification_rules import apply_classifications
apply_classifications(out,ROOT/'classification-overrides.json')
from plane_stairs_rules import apply_plane_stairs
apply_plane_stairs(out)
(ROOT/'stage1-data.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8');print(json.dumps({'instances':instances,'plans':{p['key']:p['summary'] for p in allplans}},ensure_ascii=True))
