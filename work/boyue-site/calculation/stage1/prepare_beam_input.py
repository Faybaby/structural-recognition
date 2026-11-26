"""Read the original table and loaded STEP/DWG snapshot; never alter source files."""
from pathlib import Path
import sys,json,re,hashlib,math
SITE=Path(__file__).resolve().parents[2];WORK=SITE.parent
sys.path[:0]=[str(WORK/'geometry-deps'),str(WORK/'solid-input/ocp')]
import openpyxl
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_IN,TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.gp import gp_Pnt
source=Path('C:/Users/Administrator/Documents/xwechat_files/wxid_3v1gew46nx6z22_969d/msg/file/2026-10/铝合金模板支撑间距索引表_V2.0.xlsx')
book=openpyxl.load_workbook(source,data_only=True,read_only=True);sheet=book['3000'];index=[]
for row in range(4,sheet.max_row+1):
 numbers=re.findall(r'\d+',str(sheet.cell(row,1).value or ''))
 if len(numbers)!=2:continue
 width,height=map(int,numbers)
 for col in range(2,sheet.max_column+1):
  thick=re.findall(r'\d+',str(sheet.cell(2,col).value or ''));v=sheet.cell(row,col).value
  if thick and isinstance(v,(int,float)) and v>0:index.append(dict(width=width,height=height,thickness=int(thick[0]),storyHeight=3000,spacing=v,cell=sheet.cell(row,col).coordinate))
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'))
floor_input=json.loads((SITE/'stage1/floor-input.json').read_text(encoding='utf8'))
def geom(region):return unary_union([Polygon(r['polygon'],r['holes']) for r in region])
def region(g):
 ps=[g] if g.geom_type=='Polygon' else list(g.geoms)
 return [dict(polygon=[list(p) for p in list(q.exterior.coords)[:-1]],holes=[[list(p) for p in list(h.coords)[:-1]] for h in q.interiors]) for q in ps]
def width(g):
 q=list(g.minimum_rotated_rectangle.exterior.coords);return min(math.dist(q[i],q[i+1]) for i in range(4))
beams=[]
for p in data['plans']:
 reader=STEPControl_Reader();assert reader.ReadFile(str(WORK/'solid-input'/(p['key']+'.step'))).value==1;reader.TransferRoots()
 ex=TopExp_Explorer(reader.OneShape(),TopAbs_SOLID);classifiers=[]
 while ex.More():classifiers.append(BRepClass3d_SolidClassifier(TopoDS.Solid(ex.Current())));ex.Next()
 def inside(x,y,z):
  for c in classifiers:
   c.Perform(gp_Pnt(x,z,-y),.005)
   if c.State() in (TopAbs_IN,TopAbs_ON):return True
  return False
 groups={}
 for z in p['zones']:
  if z['kind']=='gl':groups.setdefault((z['face'],z['bottom']),[]).append(z)
 slabs=[(z,geom(z['region'])) for z in floor_input['floors'] if z['key']==p['key']]
 ordinary=[(e,geom(e['region'])) for e in p['drawingEvidence'] if e['kind']=='beam']
 for (face,bottom),members in groups.items():
  g=unary_union([geom(z['region']) for z in members]);box=list(g.bounds);dx,dy=box[2]-box[0],box[3]-box[1];axis=0 if dx>=dy else 1;span=max(dx,dy);gw=min(dx,dy)
  problems=[]
  if abs(g.area-dx*dy)>.1 or len(getattr(g,'interiors',[])):problems.append('GL实体不是单一直矩形，端部待确认')
  a=[box[0],(box[1]+box[3])/2] if axis==0 else [(box[0]+box[2])/2,box[1]];b=[box[2],a[1]] if axis==0 else [a[0],box[3]]
  ends=[]
  for side,at,sign in [('start',a,-1),('end',b,1)]:
   outside=at.copy();outside[axis]+=sign*.5
   samples=[dict(height=bottom+d,inside=inside(*outside,bottom+d)) for d in [-.5,.5]]
   connected=any(v['inside'] for v in samples)
   ends.append(dict(side=side,at=at,type='yin' if connected else 'yang',evidence='端外探测到相邻原生实体，接墙/梁端' if connected else '端外无原生实体，GL凸出端',probeXY=outside,probes=samples))
  sources=[]
  for e,q in ordinary:
   fraction=g.intersection(q).area/g.area
   if fraction>.5:sources.append(dict(source=e['source'],overlap=fraction,width=round(width(q),4),labels=e.get('labels',[])))
  sources.sort(key=lambda e:(-e['overlap'],e['width']))
  physical_width=max(gw,sources[0]['width']) if sources else gw
  # GL marking takes height priority. Keep measured local top/depth separately.
  labels=[]
  for z in members:
   d=z.get('drawingDimension',{})
   if str(d.get('text','')).upper().startswith('GL') and d.get('height'):labels.append(d)
  heights=sorted(set(l['height'] for l in labels));height=heights[0] if len(heights)==1 else None
  if not height:problems.append('GL梁高标注未能唯一对应')
  slab_evidence=[dict(id=z['id'],thickness=z['thickness'],distance=round(q.distance(g),3)) for z,q in slabs if q.distance(g)<=300.01]
  thickness=max((e['thickness'] for e in slab_evidence),default=None)
  if thickness is None:problems.append('300mm邻域内没有已确认板厚，暂不猜测查表列')
  beams.append(dict(id=p['key']+'/GL'+str(sum(x['key']==p['key'] for x in beams)+1).zfill(3),key=p['key'],name='/'.join(z['id'] for z in members),memberIds=[z['id'] for z in members],sourceFace=face,bottom=bottom,nativeBase=p['base'],sourceTops=sorted(set(z['top'] for z in members)),region=region(g),axis=axis,start=a,end=b,length=span,gw=gw,width=physical_width,height=height,glHeightEvidence=labels,widthEvidence=sources,thickness=thickness,slabEvidence=slab_evidence,ends=ends,issues=problems))
out=dict(version=1,storyHeight=3000,source=dict(file=source.name,sha256=hashlib.sha256(source.read_bytes()).hexdigest(),sheet='3000',rowMeaning='梁宽×梁高',columnMeaning='板厚'),index=index,beams=beams,rules=dict(widthHeightRounding='both-up-to-existing-table-dimensions',gdLength='physical-beam-width-not-rounded-table-width',heightPriority='GL',slabThickness='maximum-confirmed-adjacent-within-300mm',endProbe='original STEP solids +/-0.5mm beyond rectangular GL cap; at bottom +/-0.5mm',longitudinalModulus=50,gwSplitInclusive=150,gllSmall=[100,130],gllLarge=[50,80],gllLargePreferred=50,longEndMin=500,longEndMaxDeduction=100,scope='GL挂梁实体；普通梁与楼梯阳线未纳入本次'))
(SITE/'stage1/beam-input.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps(dict(beams=len(beams),indexCells=len(index),endTypes={k:sum(e['type']==k for b in beams for e in b['ends']) for k in ['yang','yin']},issues=[dict(id=b['id'],issues=b['issues']) for b in beams if b['issues']],examples=[{k:b[k] for k in ['id','name','length','gw','width','height','thickness','ends']} for b in beams[:3]]),ensure_ascii=False))
