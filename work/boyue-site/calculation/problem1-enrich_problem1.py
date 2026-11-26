"""Join supplied 2D dimensions to native 3D bearing faces, without importing 2D results."""
from pathlib import Path
import json,math,collections
ROOT=Path(__file__).parent
ns={'__file__':str(ROOT/'recognize.py')};exec((ROOT/'recognize.py').read_text(encoding='utf8').split('ALL=[];NATIVE={}')[0],ns)
globals().update({k:v for k,v in ns.items() if not k.startswith('__')})
site=ROOT.parent/'boyue-site';d=json.loads((site/'model3d-data.json').read_text(encoding='utf8'));q=json.loads((site/'project-data.json').read_text(encoding='utf8'));baselines=json.loads((ROOT/'baselines.json').read_text(encoding='utf8'))
def geom(rs):return unary_union([Polygon(r['polygon'],r['holes']) for r in rs])
for p in d['plans']:
 key=p['key'];draw=next(v for v in q['variants']['aligned']['plans'] if v['key']==key);shared=q['sharedPlans'][key];p['baseline']=baselines[key];features=p['features'];groups=[]
 native={f['id']:geom(f['region']) for f in features};beamfeatures=[f for f in features if f['kind']=='beam'];slabs=[f for f in features if f['kind']=='slab'];g3=unary_union([native[f['id']] for f in slabs]);g2=unary_union([Polygon(s['polygon']) for s in draw['slabs']]);p['registration']={'scale':1,'rotation':0,'translation':[0,0],'slabIntersectionOverUnion':g3.intersection(g2).area/g3.union(g2).area,'dwgOffsetX':draw['offsetX'],'dwgSha256':'aaf0ced4c6aed4dbb97440292e1c678b4c481b829e52ffa83c9d37cd1802cef0'}
 def eligible(axis,f):
  g=native[f['id']];pts=axis['points'];return sum(g.buffer(.1).covers(Point(at)) for at in pts)/len(pts)
 for b in draw['beams']:
  segments=b.get('centerlineSegments') or [{'type':'line','a':b['a'],'b':b['b'],'length':math.dist(b['a'],b['b'])}]
  for ai,a in enumerate(segments):
   if a['type']=='arc':
    center=a.get('center');R=a.get('radius');start=a.get('start',a.get('startAngle'));sweep=a.get('sweep')
    # Old DWG representation uses start/end and bulge-derived angles.
    if center is None:continue
    if start is None:start=math.atan2(a['a'][1]-center[1],a['a'][0]-center[0])
    if sweep is None:sweep=a.get('sweepAngle')
    if sweep is None:continue
    axis=dict(type='arc',center=center,radius=R,start=start,sweep=sweep,length=abs(sweep)*R,a=a['a'],b=a['b'])
    pts=[[center[0]+R*math.cos(start+sweep*t/40),center[1]+R*math.sin(start+sweep*t/40)] for t in range(41)]
   else:
    axis=dict(type='line',a=a['a'],b=a['b'],length=math.dist(a['a'],a['b']),angle=math.atan2(a['b'][1]-a['a'][1],a['b'][0]-a['a'][0]));pts=[[a['a'][j]+(a['b'][j]-a['a'][j])*t/40 for j in [0,1]] for t in range(41)]
   axis['points']=pts;matches=[(eligible(axis,f),f) for f in beamfeatures];matches=[(v,f) for v,f in matches if v>.025]
   if not matches:continue
   covered=[f['id'] for _,f in matches];ts=b.get('adjacentThicknesses') or [b['thickness']];gl=[r for r in draw.get('glBeams',[]) if r.get('hostSource')==b['source'] or Polygon(r['polygon']).intersection(Polygon(b['polygon'])).area>1]
   groups.append(dict(id=key+'-D2-'+b['id']+'-'+str(ai),source=b['source'],axis=axis,width=b['width'],depth=b['depth'],adjacentThicknesses=ts,gl=gl,features=covered,sourceKind='二维实体梁轴线、梁宽及GL标注；三维承托面确认'))
 # Native arcs and beams not present in 2D remain explicit source geometry.
 for f in beamfeatures:
  for i,a in enumerate(f['axes']):
   mid=a['a'] if a['length']<1 else ([a['center'][0]+a['radius']*math.cos(a['start']+a['sweep']/2),a['center'][1]+a['radius']*math.sin(a['start']+a['sweep']/2)] if a['type']=='arc' else [(x+y)/2 for x,y in zip(a['a'],a['b'])])
   if any(f['id'] in g['features'] and LineString(g['axis']['points']).distance(Point(mid))<max(a['width'],g['width'])/2+1 for g in groups):continue
   if a['width']>600 or a['length']<100:continue
   axis=dict(a);axis.pop('rule',None)
   axis['points']=[[a['center'][0]+a['radius']*math.cos(a['start']+a['sweep']*t/40),a['center'][1]+a['radius']*math.sin(a['start']+a['sweep']*t/40)] for t in range(41)] if a['type']=='arc' else [a['a'],a['b']]
   groups.append(dict(id=key+'-N-'+f['id']+'-'+str(i),source=f['face'],axis=axis,width=a['width'],depth=f['depth'],adjacentThicknesses=f['adjacentThicknesses'],gl=[],features=[f['id']],sourceKind='三维原生中心线与几何尺寸'))
 for g in groups:
  line=LineString(g['axis']['points'])
  g['gl']=[r for r in draw.get('glBeams',[]) if line.intersection(Polygon(r['polygon']).buffer(.1)).length>1]
 p['beamGroups']=groups
 # Highest native up-facing plane below each support is the actual potential footing.
 reader=STEPControl_Reader();reader.ReadFile(str(ROOT/(key+'.step')));reader.TransferRoots();footings=[]
 physical={f['nativeBody'] for f in features};raw=json.loads((ROOT/(key+'-native.json')).read_text(encoding='utf8'))
 for si,solid in enumerate(explore(reader.OneShape(),TopAbs_SOLID,TopoDS.Solid),1):
  bb=bbox(solid);body=min(raw['bodies'],key=lambda b:sum(abs(x-y) for x,y in zip(bb,b['box'])))
  if body['id'] not in physical:continue
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):
   su=BRepAdaptor_Surface(face)
   if su.GetType()!=GeomAbs_Plane:continue
   plane=su.Plane();ny=plane.Axis().Direction().Y()*(-1 if face.Orientation()==TopAbs_REVERSED else 1)
   if ny<.99999:continue
   g,_,_=face_geometry(face)
   if not g.is_empty and g.area>100:footings.append(dict(z=plane.Location().Y(),region=serialize_g(g),face=f'{key}-B{si}-F{fi}'))
 p['footings']=footings
 p['input2d']={'file':'20261105铂悦府6#铝模深化底图.dwg','role':'仅提供尺寸、GL、挂梁轮廓与基准参考；不加载二维计算节点','offsetX':draw['offsetX']}
 p['hangingRectangles']=draw.get('endSupports',[])
 p['nativeInitialSummary']=p['summary'];p['nodes']=[];p['issues']=[]
for p in d['plans']:
 other=next(o for o in d['plans'] if o['key']!=p['key']);same=[];diff=[]
 for f in p['features']:
  if f['kind'] not in ['beam','slab']:continue
  g=geom(f['region']);equal=unary_union([geom(o['region']) for o in other['features'] if o['kind']==f['kind'] and abs(o['depth']-f['depth'])<.01 and abs(o['bottom']-f['bottom'])<.01]);changed=g.difference(equal)
  if not changed.is_empty:diff.append(changed)
 mask=clean(unary_union(diff));adjacent=[geom(f['region']) for f in p['features'] if f['kind']=='beam' and geom(f['region']).distance(mask)<1]
 p['differenceRegions']=serialize_g(clean(unary_union([mask,*adjacent])))
d['indexRows']=RULES;d['problem1']={'manualHeightThreshold':max(r['H'] for r in RULES),'floorFallback':1200,'holeCenterClearance':150,'yangLengthFormula':'200 + d - 50*round(d/50)','braceNetHeightThreshold':3200}
d.pop('verification',None);d['version']=2;d['calculation']='二维尺寸辅助 + 三维B-rep承托面 + 基准50mm相位 + 交点/阳线端优先 + 分层连接'
(site/'model3d-input.json').write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps({p['key']:{'beams':len(p['beamGroups']),'gl':sum(bool(g['gl']) for g in p['beamGroups']),'registration':p['registration']} for p in d['plans']},ensure_ascii=True))

