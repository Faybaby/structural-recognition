"""Extract native STEP faces and the 3-D display mesh for the Hangzhou 4F project."""
import argparse
import base64
import collections
import json
import math
from pathlib import Path
import struct

from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepTools import BRepTools, BRepTools_WireExplorer
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Line, GeomAbs_Circle
from OCP.GProp import GProp_GProps
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_SOLID, TopAbs_FACE, TopAbs_WIRE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from shapely import set_precision
from shapely.geometry import GeometryCollection, Polygon

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


project = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--step', type=Path, default=project / 'hangzhou-4.step')
parser.add_argument('--output', type=Path, default=project)
args = parser.parse_args()
d = args.output
d.mkdir(parents=True, exist_ok=True)
reader=STEPControl_Reader()
if int(reader.ReadFile(str(args.step))) != 1:
 raise ValueError(f'Could not read STEP: {args.step}')
if reader.TransferRoots() <= 0:
 raise ValueError('No transferable STEP roots')
shape=reader.OneShape()
bounds=bbox(shape)
print('bounds',bounds,flush=True)
mesher=BRepMesh_IncrementalMesh(shape,1.2,False,.35,True)
faces=[];mesh=[];bodies=list(explore(shape,TopAbs_SOLID,TopoDS.Solid))
for bi,solid in enumerate(bodies):
 for i,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face)):
  adapt=BRepAdaptor_Surface(face)
  loc=TopLoc_Location(); tri=BRep_Tool.Triangulation_s(face,loc)
  tris=[]
  if tri:
   nodes=[tri.Node(j).Transformed(loc.Transformation()) for j in range(1,tri.NbNodes()+1)]
   for j in range(1,tri.NbTriangles()+1):
    ix=list(tri.Triangle(j).Get())
    if face.Orientation()==TopAbs_REVERSED: ix.reverse()
    pts=[nodes[k-1] for k in ix]
    mesh.extend(round(v,3) for p in pts for v in (p.X(),p.Y(),p.Z()))
    tris.append([[round(p.X(),3),round(-p.Z(),3),round(p.Y(),3)] for p in pts])
  if adapt.GetType()!=GeomAbs_Plane:continue
  pl=adapt.Plane(); axis=pl.Axis().Direction(); sign=-1 if face.Orientation()==TopAbs_REVERSED else 1; n=[axis.X()*sign,-axis.Z()*sign,axis.Y()*sign]
  if abs(n[2])<.05:continue
  height=pl.Location().Y()
  if abs(n[2])<.99999 and tris:height=sum(p[2] for t in tris for p in t)/(3*len(tris))
  g,loops,edges=face_geometry(face)
  if g.is_empty:continue
  rr=serialize_g(g)
  for j,reg in enumerate(rr):
   poly=Polygon(reg['polygon'],reg['holes']); pp=pl.Location(); source=[pp.X(),-pp.Z(),pp.Y()]
   f=dict(id=f'HZ/B{bi+1}F{i+1}'+(f'P{j+1}' if len(rr)>1 else ''),component='杭州5#楼基本层',direction='up' if n[2]>0 else 'down',kind='receiver' if n[2]>0 else 'ordinary',confirmed=True,area=area(face) if len(rr)==1 else poly.area/abs(n[2]),height=height,planeNormal=n,planeOrigin=source,sloped=abs(n[2])<.99999,triangles=tris,thickness=0,beamHeight=0,edges=[],hasCurves=any(e['type']!='line' for e in edges),reason='STEP 原生平面及裁剪边界',**reg)
   for loop in loops:
    for e in loop['edges']:
     f['edges'].append(dict(start=e['a'],end=e['b'],type='unknown',outer=loop['outer'],isLine=e['type']=='line',curvePoints=e['points'],circleCenter=e['circle']['center'] if e['circle'] else None,circleRadius=e['circle']['radius'] if e['circle'] else 0,reason='STEP 边界，待核对阴阳端'))
   faces.append(f)
print('solids',len(bodies),'faces',len(faces),'triangles',len(mesh)//9)
for di in ['up','down']:
 print(di,collections.Counter(round(f['height'],1) for f in faces if f['direction']==di).most_common(30))
 print('area rank',sorted(((round(f['area']),round(f['height'],2),f['id']) for f in faces if f['direction']==di),reverse=True)[:15])
(d/'native.json').write_text(json.dumps(dict(axis='Y',faces=faces,meshTriangles=[]),ensure_ascii=False,separators=(',',':')),encoding='utf8')
(d/'mesh.json').write_text(json.dumps(dict(box=bounds,positions=base64.b64encode(struct.pack('<%sf'%len(mesh),*mesh)).decode(),vertices=len(mesh)//3),separators=(',',':')),encoding='utf8')
