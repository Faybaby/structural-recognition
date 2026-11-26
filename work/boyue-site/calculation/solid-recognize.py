"""Read STEP B-rep copies; render meshes are separate from calculation geometry."""
from pathlib import Path
import sys,json,math,collections,base64,struct
ROOT=Path(__file__).parent;sys.path[:0]=[str(ROOT/'ocp'),str(ROOT.parent/'geometry-deps'),str(ROOT.parent/'boyue-test')]
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_WIRE,TopAbs_REVERSED,TopAbs_IN,TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface,BRepAdaptor_Curve
from OCP.BRepTools import BRepTools_WireExplorer,BRepTools
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.GeomAbs import GeomAbs_Plane,GeomAbs_Line,GeomAbs_Circle
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.gp import gp_Pnt
from shapely.geometry import Polygon,Point,LineString,GeometryCollection
from shapely.ops import unary_union
from shapely import set_precision
from compact_floor import layout,coverage_missing,spacing_pass
from gl_effective import RULES

def explore(shape,kind,cast):
 ex=TopExp_Explorer(shape,kind)
 while ex.More():yield cast(ex.Current());ex.Next()
def bbox(shape):
 b=Bnd_Box();BRepBndLib.AddOptimal_s(shape,b,False,False);a=b.CornerMin();c=b.CornerMax();return [a.X(),a.Y(),a.Z(),c.X(),c.Y(),c.Z()]
def xy(p):return [p.X(),-p.Z()]
def clean(g):return set_precision(g.buffer(0),.01)
def parts(g):return [g] if g.geom_type=='Polygon' else [q for q in getattr(g,'geoms',[]) if q.geom_type=='Polygon']
def area(shape):
 prop=GProp_GProps();BRepGProp.SurfaceProperties_s(shape,prop);return prop.Mass()
def wire_info(wire,face):
 ex=BRepTools_WireExplorer(wire,face);points=[];edges=[]
 while ex.More():
  e=TopoDS.Edge(ex.Current());c=BRepAdaptor_Curve(e);u,v=c.FirstParameter(),c.LastParameter();a=c.Value(u);b=c.Value(v);kind=c.GetType();circle=None
  if kind==GeomAbs_Line:n=1;length=a.Distance(b);typ='line'
  elif kind==GeomAbs_Circle:
   ci=c.Circle();r=ci.Radius();length=r*abs(v-u);n=max(2,math.ceil(abs(v-u)/(2*math.acos(max(-1,1-.01/r)))));typ='arc';circle=dict(center=xy(ci.Location()),radius=r)
  else:n=64;length=None;typ='curve'
  pts=[xy(c.Value(u+(v-u)*i/n)) for i in range(n+1)]
  if e.Orientation()==TopAbs_REVERSED:pts.reverse()
  if points and math.dist(points[-1],pts[0])>.05:
   if math.dist(points[-1],pts[-1])<.05:pts.reverse()
  points.extend(pts if not points else pts[1:]);edges.append(dict(type=typ,a=pts[0],b=pts[-1],length=length,circle=circle,points=pts))
  ex.Next()
 return points,edges
def face_geometry(face):
 outer=BRepTools.OuterWire_s(face);loops=[];outerpoints=[];holes=[];edges=[]
 for w in explore(face,TopAbs_WIRE,TopoDS.Wire):
  pts,ee=wire_info(w,face);isouter=w.IsSame(outer);loops.append(dict(outer=isouter,points=pts,edges=ee));edges.extend(ee)
  if isouter:outerpoints=pts
  else:holes.append(pts)
 if len(outerpoints)<3:return GeometryCollection(),loops,edges
 return clean(Polygon(outerpoints,holes)),loops,edges
def serialize_g(g):return [dict(polygon=[[round(x,3),round(y,3)] for x,y in list(p.exterior.coords)[:-1]],holes=[[[round(x,3),round(y,3)] for x,y in list(r.coords)[:-1]] for r in p.interiors]) for p in parts(g)]
def index(width,depth,thickness,H=3000):
 widths=sorted({r['W'] for r in RULES if r['H']==H and r['W']>=width and r['W']>0})
 for w in widths:
  rr=[r for r in RULES if r['H']==H and r['W']==w and r['D']==round(depth,3) and r['T'] in thickness]
  if len({r['T'] for r in rr})==len(set(thickness)):
   r=min(rr,key=lambda r:r['S']);return dict(index=r['S'],limit=r['S']-100,lookupWidth=w,cells=[q['Cell'] for q in rr])
 return None
def slab_index(t,H=3000):
 r=next((r for r in RULES if r['H']==H and r['W']==0 and r['T']==round(t,3)),None)
 return dict(indexX=r['S'],indexY=r['Sy'] or r['S'],limitX=r['S']-100,limitY=(r['Sy'] or r['S'])-100,cell=r['Cell']) if r else None

def axes_for(g,edges):
 axes=[];seen=set();lines=[e for e in edges if e['type']=='line']
 for horizontal in [True,False]:
  parallel=[e for e in lines if abs(e['a'][1 if horizontal else 0]-e['b'][1 if horizontal else 0])<.05 and math.dist(e['a'],e['b'])>=80]
  for i,a in enumerate(parallel):
   ai=1 if horizontal else 0;bi=1-ai;ca=a['a'][ai];alo,ahi=sorted([a['a'][bi],a['b'][bi]])
   for b in parallel[i+1:]:
    cb=b['a'][ai];w=abs(ca-cb)
    if w<50-.05 or w>1000+.05:continue
    blo,bhi=sorted([b['a'][bi],b['b'][bi]]);lo=max(alo,blo);hi=min(ahi,bhi)
    if hi-lo<80:continue
    mid=(ca+cb)/2;p=[0,0];q=[0,0];p[ai]=q[ai]=mid;p[bi]=lo;q[bi]=hi;line=LineString([p,q])
    if not g.buffer(.03).covers(line):continue
    # Reject pairs across separate strips or a wide region whose actual width differs.
    test=[0,0];test[bi]=(lo+hi)/2;test[ai]=mid;cross=LineString([[test[0],g.bounds[1]-2],[test[0],g.bounds[3]+2]]) if horizontal else LineString([[g.bounds[0]-2,test[1]],[g.bounds[2]+2,test[1]]]);inter=g.intersection(cross)
    segments=[inter] if inter.geom_type=='LineString' else list(getattr(inter,'geoms',[]));match=[s for s in segments if s.distance(Point(test))<.05]
    if not match or min(abs(s.length-w) for s in match)>.1:continue
    token=(horizontal,round(mid,2),round(lo,2),round(hi,2),round(w,1))
    if token in seen:continue
    seen.add(token);axes.append(dict(type='line',a=p,b=q,width=round(w,1),length=hi-lo,angle=0 if horizontal else math.pi/2))
 # Exact concentric circular B-rep edges form curved beam centerlines.
 arcs=[e for e in edges if e['type']=='arc']
 for i,a in enumerate(arcs):
  for b in arcs[i+1:]:
   ca,cb=a['circle'],b['circle'];w=abs(ca['radius']-cb['radius'])
   if math.dist(ca['center'],cb['center'])>.05 or not 50-.05<=w<=1000+.05:continue
   center=ca['center'];R=(ca['radius']+cb['radius'])/2;theta=a['length']/ca['radius'];start=math.atan2(a['a'][1]-center[1],a['a'][0]-center[0]);pm=a['points'][len(a['points'])//2];cross=(a['a'][0]-center[0])*(pm[1]-center[1])-(a['a'][1]-center[1])*(pm[0]-center[0]);sweep=theta*(1 if cross>0 else -1)
   pts=[[center[0]+R*math.cos(start+sweep*t/20),center[1]+R*math.sin(start+sweep*t/20)] for t in range(21)]
   if not all(g.buffer(.05).covers(Point(p)) for p in pts):continue
   axes.append(dict(type='arc',center=center,radius=R,start=start,sweep=sweep,width=round(w,1),length=abs(sweep)*R,a=pts[0],b=pts[-1]))
 return axes

ALL=[];NATIVE={};REPORT={}
for key in ['odd','even']:
 raw=json.loads((ROOT/(key+'-native.json')).read_text(encoding='utf-8'));reader=STEPControl_Reader();reader.ReadFile(str(ROOT/(key+'.step')));reader.TransferRoots();shape=reader.OneShape();horizontal=[];bodies=[]
 nativebodies=raw['bodies']
 for si,solid in enumerate(explore(shape,TopAbs_SOLID,TopoDS.Solid),1):
  bb=bbox(solid);nb=min(nativebodies,key=lambda b:sum(abs(a-c) for a,c in zip(bb,b['box'])));name=nb['name'];helper='爬架' in name or '洞口' in name or '避让' in name
  bodies.append(dict(id=si,nativeBody=nb['id'],name=name,helper=helper,box=bb))
  if helper:continue
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):
   surface=BRepAdaptor_Surface(face)
   if surface.GetType()!=GeomAbs_Plane:continue
   plane=surface.Plane();normal=plane.Axis().Direction();ny=normal.Y()*(-1 if face.Orientation()==TopAbs_REVERSED else 1)
   if abs(ny)<.99999:continue
   g,loops,edges=face_geometry(face)
   if g.is_empty or g.area<10:continue
   z=plane.Location().Y();fid=f'{key}-B{si}-F{fi}';NATIVE[fid]=face
   horizontal.append(dict(id=fid,solid=si,nativeBody=nb['id'],nativeArea=area(face),g=g,edges=edges,loops=loops,z=z,normal=ny))
 up=[f for f in horizontal if f['normal']>0];down=[f for f in horizontal if f['normal']<0];level=max(up,key=lambda f:f['g'].area)['z'];bottoms=[f for f in down if f['z']<level-1500];base=max(bottoms,key=lambda f:f['g'].area)['z'];H=round(level-base)
 walls=clean(unary_union([f['g'] for f in bottoms]));helpers=clean(unary_union([Polygon([[b['box'][0],-b['box'][2]],[b['box'][3],-b['box'][2]],[b['box'][3],-b['box'][5]],[b['box'][0],-b['box'][5]]]) for b in bodies if b['helper']]))
 holes=[]
 for f in up:
  if abs(f['z']-level)>1:continue
  for part in parts(f['g']):
   for ring in part.interiors:
    g=Polygon(ring)
    if g.area>10000 and g.intersection(walls).area/g.area<.9:holes.append(g.difference(walls.buffer(.05)))
 openings=clean(unary_union([helpers,*holes]));features=[];native_errors=[]
 for f in down:
  if f['z']<level-1500 or f['z']>level-30:continue
  remainder=f['g']
  for top in sorted(up,key=lambda q:q['z']):
   if top['z']<=f['z']+.1 or remainder.is_empty:continue
   inter=clean(remainder.intersection(top['g']))
   if inter.is_empty:continue
   remainder=clean(remainder.difference(inter));D=round(top['z']-f['z'],3)
   for gi,g in enumerate(parts(inter)):
    if g.area<2500:continue
    rect=g.minimum_rotated_rectangle;coords=list(rect.exterior.coords);dims=sorted([math.dist(a,b) for a,b in zip(coords,coords[1:])]);width=dims[0]
    kind='slab' if D<=250 and width>=350 else 'beam' if D>=250 else 'detail'
    rid=f['id']+'-'+str(len(features)+1);axes=axes_for(g,f['edges']) if kind=='beam' else []
    record=dict(id=rid,face=f['id'],nativeBody=f['nativeBody'],kind=kind,bottom=f['z'],top=top['z'],depth=D,g=g,axes=axes,area=g.area,region=serialize_g(g),rule=None,status='待确认')
    if kind=='slab':record['rule']=slab_index(D,H);record['thickness']=D
    if kind=='beam':record['widths']=sorted({a['width'] for a in axes})
    if kind=='detail':record['status']='窄小细部/楼梯等，未自动当作梁板'
    features.append(record)
  if not remainder.is_empty and remainder.area>100: native_errors.append(dict(face=f['id'],reason='未匹配到上方实体顶面',area=remainder.area))
 slabs=[f for f in features if f['kind']=='slab'];beams=[f for f in features if f['kind']=='beam'];nodes=[];issues=[]
 # A hole in the highest roof face may contain a lower, sunken floor.
 # Preserve actual helper exclusions, but remove real slab/beam bearing areas
 # from the inferred roof-hole mask before calculating opening clearances.
 bearing=unary_union([f['g'] for f in features if f['kind'] in ['slab','beam']])
 openings=clean(unary_union([helpers,unary_union(holes).difference(bearing)]))
 for f in features:
  if f['kind']=='beam':
   near=[q for q in slabs if q['rule'] and q['g'].distance(f['g'])<2];distance=0
   if not near:
    nearest=sorted([q for q in slabs if q['rule']],key=lambda q:q['g'].distance(f['g']))[:1];near=nearest;distance=near[0]['g'].distance(f['g']) if near else None
   ts=sorted({q['thickness'] for q in near});f['adjacentThicknesses']=ts;f['adjacencyDistance']=distance
   for axis in f['axes']:axis['rule']=index(axis['width'],f['depth'],ts,H) if ts else None
  if f['kind']=='slab' and f['rule']:
   usable=clean(f['g'].difference(helpers));rule=f['rule']
   try:
    q=layout(usable,rule['limitX'],rule['limitY'],[openings]);f['layout']={k:v for k,v in q.items() if k not in ['nodes']};f['status']='窄跨免加' if q['exempt'] else '已计算'
    for at in q['nodes']:nodes.append(dict(feature=f['id'],face=f['face'],at=[*at,f['bottom']],kind='slab',model='GD',rule=rule,angle=0))
   except Exception as e:f['status']='异形楼面未找到合规方案';issues.append(dict(feature=f['id'],reason=str(e)))
  elif f['kind']=='slab':f['status']='板厚/层高索引缺项'
  if f['kind']=='beam':
   f['status']='已计算' if f['axes'] and all(a['rule'] for a in f['axes']) else '梁高/梁宽/板厚索引或轴线待补'
   for a in f['axes']:
    r=a['rule']
    if not r:continue
    L=a['length'];S=r['limit'];n=max(1,math.ceil(L/S)-1);spacing=min(S,L/n)
    def at(t):
     if a['type']=='line':return [a['a'][i]+(a['b'][i]-a['a'][i])*t/L for i in [0,1]]
     theta=a['start']+a['sweep']*t/L;return [a['center'][0]+a['radius']*math.cos(theta),a['center'][1]+a['radius']*math.sin(theta)]
    for i in range(n):
     t=L/2+(i-(n-1)/2)*spacing;p=at(t)
     if walls.distance(Point(p))<S or openings.distance(Point(p))<150.25:continue
     angle=a.get('angle') if a['type']=='line' else a['start']+a['sweep']*t/L+math.copysign(math.pi/2,a['sweep'])
     nodes.append(dict(feature=f['id'],face=f['face'],at=[*p,f['bottom']],kind='beam',model='GD100X'+str(round(a['width'])),rule=r,angle=angle,station=t,arc=a['type']=='arc'))
  if f['status'] not in ['已计算','窄跨免加']:
   issues.append(dict(feature=f['id'],reason=f['status']))
 # Authoritative B-rep face membership, distinct from display tessellation.
 good=[];seen=set();rejected=[]
 for n in nodes:
  p=n['at'];token=tuple(round(x,1) for x in p)
  if token in seen:continue
  face=NATIVE[n['face']];state=BRepClass_FaceClassifier(face,gp_Pnt(p[0],p[2],-p[1]),.01).State();clearance=openings.distance(Point(p[:2]))
  if state not in [TopAbs_IN,TopAbs_ON] or clearance<150.24:rejected.append(dict(at=p,face=n['face'],reason='B-rep面内或洞口150检查未通过'));continue
  seen.add(token);n.update(id=key+'-3D-'+str(len(good)+1).zfill(4),nativeFacePass=True,openingDistance=clearance,sourceXYZ=[p[0],p[2],-p[1]]);good.append(n)
 maxarea=max(abs(f['g'].area-f['nativeArea'])/max(f['nativeArea'],1) for f in horizontal)
 for f in features:f.pop('g',None)
 bodiesmeta={b['nativeBody']:b for b in bodies};meshes=[]
 for b in raw['bodies']:
  meta=bodiesmeta.get(b['id'],{});vals=b['positions'];binary=struct.pack('<'+'f'*len(vals),*vals);meshes.append(dict(id=b['id'],name=b['name'],helper=meta.get('helper',False),positions=base64.b64encode(binary).decode(),vertexCount=len(vals)//3,faces=[dict(id=f['id'],start=f['meshStart'],count=f['meshCount']) for f in b['faces']]))
 result=dict(key=key,name='奇数层' if key=='odd' else '偶数层',file=raw['file'],sha256=raw['sha256'],sourceBox=raw['box'],base=base,level=level,floorHeight=H,meshes=meshes,features=features,nodes=good,issues=issues,openings=serialize_g(openings),walls=serialize_g(walls),rejectedNodes=rejected,unmatchedFaces=native_errors,summary=dict(bodies=len(raw['bodies']),physicalBodies=sum(not b['helper'] for b in bodies),faces=len(horizontal),slabs=len(slabs),beams=len(beams),features=len(features),nodes=len(good),beamNodes=sum(n['kind']=='beam' for n in good),slabNodes=sum(n['kind']=='slab' for n in good),issues=len(issues),nativeFacePass=len(good),boundaryMaxRelativeAreaError=maxarea,inventory=dict(collections.Counter(n['model'] for n in good))))
 (ROOT/(key+'-recognized.json')).write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8');ALL.append(result);REPORT[key]=result['summary'];print(key,json.dumps(result['summary'],ensure_ascii=True),flush=True)
def geom(regions):return unary_union([Polygon(r['polygon'],r['holes']) for r in regions])
contexts={p['key']:dict(plan=p,features=[dict(f,g=geom(f['region'])) for f in p['features']],walls=geom(p['walls']),holes=geom(p['openings'])) for p in ALL}
def station(axis,at):
 if axis['type']=='line':
  line=LineString([axis['a'],axis['b']]);return line.project(Point(at)) if line.distance(Point(at))<.05 else None
 theta=math.atan2(at[1]-axis['center'][1],at[0]-axis['center'][0]);delta=((theta-axis['start'])*math.copysign(1,axis['sweep']))%(2*math.pi)
 return delta*axis['radius'] if abs(math.dist(at,axis['center'])-axis['radius'])<.05 and delta<=abs(axis['sweep'])+1e-5 else None
def hit(ctx,at):
 found=[f for f in ctx['features'] if f['kind'] in ['beam','slab'] and f['g'].buffer(.02).covers(Point(at))]
 for f in sorted(found,key=lambda f:f['kind']!='beam'):
  if f['kind']=='beam':
   ax=[a for a in f['axes'] if station(a,at) is not None and a['rule']]
   if ax:return f,ax[0]
  elif f['rule']:return f,None
 return None
paired={};newnodes={k:{} for k in contexts};pairRejected=[]
def put(at):
 token=tuple(round(v,3) for v in at);hits={k:hit(c,at) for k,c in contexts.items()}
 if not all(hits.values()):return False
 beamHits=[(k,f,a) for k,(f,a) in hits.items() if a];design=max((f['depth'] for k,f,a in beamHits),default=0);rules={}
 for k,(f,a) in hits.items():
  c=contexts[k]
  if c['holes'].distance(Point(at))<150.25:return False
  if a:
   r=index(a['width'],design,f['adjacentThicknesses'],c['plan']['floorHeight'])
   if not r or c['walls'].distance(Point(at))<r['limit']:return False
   rules[k]=r
  else:
   if f.get('layout',{}).get('exempt') and not beamHits:return False
   rules[k]=f['rule']
 for k,(f,a) in hits.items():
  if BRepClass_FaceClassifier(NATIVE[f['face']],gp_Pnt(at[0],f['bottom'],-at[1]),.01).State() not in [TopAbs_IN,TopAbs_ON]:return False
 if token not in paired:paired[token]='3D-P'+str(len(paired)+1).zfill(4)
 for k,(f,a) in hits.items():
  angle=0 if not a else a.get('angle',math.atan2(at[1]-a.get('center',[0,0])[1],at[0]-a.get('center',[0,0])[0])+math.copysign(math.pi/2,a.get('sweep',1)))
  newnodes[k][token]=dict(id='',feature=f['id'],face=f['face'],at=[*token,f['bottom']],sourceXYZ=[*[]],kind=f['kind'],model='GD' if not a else 'GD100X'+str(round(a['width'])),angle=angle,rule=rules[k],nativeFacePass=True,openingDistance=contexts[k]['holes'].distance(Point(at)),shared=True,pairId=paired[token],designDepth=design if a else f['depth'],nativeDepth=f['depth'],source='三维实体承托面；重叠处取最大有效梁高')
 return True
for p in ALL:
 for n in p['nodes']:put(n['at'][:2])
# Generate joint beam stations using the controlling depth of the other model.
for key,c in contexts.items():
 other=contexts['even' if key=='odd' else 'odd']
 for f in c['features']:
  for a in f['axes']:
   if not a['rule']:continue
   relevant=[q for q in other['features'] if q['kind']=='beam' and q['g'].intersection(f['g']).area>1];D=max([f['depth'],*[q['depth'] for q in relevant]]);r=index(a['width'],D,f['adjacentThicknesses'],c['plan']['floorHeight'])
   if not r:continue
   L=a['length'];S=r['limit'];n=max(1,math.ceil(L/S)-1);step=min(S,L/n)
   for i in range(n):
    t=L/2+(i-(n-1)/2)*step
    if a['type']=='line':at=[a['a'][j]+(a['b'][j]-a['a'][j])*t/L for j in [0,1]]
    else:theta=a['start']+a['sweep']*t/L;at=[a['center'][0]+a['radius']*math.cos(theta),a['center'][1]+a['radius']*math.sin(theta)]
    put(at)
for key,c in contexts.items():
 other=contexts['even' if key=='odd' else 'odd'];p=c['plan']
 for n in p['nodes']:
  token=tuple(round(v,3) for v in n['at'][:2])
  if token in newnodes[key]:continue
  # A changed native axis or an unsupported counterpart is not made into a false pair.
  otherg=[f for f in other['features'] if f['kind'] in ['slab','beam'] and f['g'].buffer(.02).covers(Point(token))]
  nn=dict(n,shared=False,pairId=None,designDepth=next(f['depth'] for f in c['features'] if f['id']==n['feature']),nativeDepth=next(f['depth'] for f in c['features'] if f['id']==n['feature']),source='三维结构差异单独布置',alignmentReview=bool(otherg));newnodes[key][token]=nn
  if otherg:pairRejected.append(dict(layer=key,feature=n['feature'],at=n['at'],reason='另一层承托轴线、免加条件或索引不兼容，保留单层并列待对位'))
 p['nodes']=list(newnodes[key].values())
 for i,n in enumerate(p['nodes'],1):n['id']=key+'-3D-'+str(i).zfill(4);n['sourceXYZ']=[n['at'][0],n['at'][2],-n['at'][1]]
 for f in p['features']:
  own=[n for n in p['nodes'] if n['feature']==f['id']];f['nodeCount']=len(own);f['sharedCount']=sum(n['shared'] for n in own)
  if f['kind']=='slab' and f['rule'] and not f.get('layout',{}).get('exempt'):
   g=geom(f['region']);ns=[n['at'][:2] for n in own];r=f['rule'];missing=coverage_missing(g,ns,r['limitX'],r['limitY']);f['coverageMissing']=missing;f['checkPass']=missing<=1 and spacing_pass(g,ns,r['limitX'],r['limitY'])
   if not f['checkPass']:
    f['status']='联合点位覆盖/间距待复核';p['issues'].append(dict(feature=f['id'],reason='三维联合点位的楼面覆盖或间距待复核'))
 p['issues'].extend(q for q in pairRejected if q['layer']==key)
 p['summary'].update(nodes=len(p['nodes']),beamNodes=sum(n['kind']=='beam' for n in p['nodes']),slabNodes=sum(n['kind']=='slab' for n in p['nodes']),sharedNodes=sum(n['shared'] for n in p['nodes']),independentNodes=sum(not n['shared'] for n in p['nodes']),nativeFacePass=len(p['nodes']),issues=len(p['issues']),inventory=dict(collections.Counter(n['model'] for n in p['nodes'])))
data=dict(version=1,source='SolidWorks native SLDPRT → STEP B-rep recognition',display='original native face tessellation; excluded climbing-clearance helpers',calculation='Native B-rep planes, topology, circular arcs; GD centers checked with B-rep face classifier',boundaryChordError=.01,pairedCoordinates=len(paired),pairRejected=pairRejected,plans=ALL)
(ROOT.parent/'boyue-site/model3d-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'recognition-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding='utf-8')
