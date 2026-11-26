"""Read-only native underside boundary evidence for the beam review labels."""
from pathlib import Path
import sys,json,math,collections
SITE=Path(__file__).resolve().parents[2];WORK=SITE.parent
sys.path[:0]=[str(WORK/'solid-input/ocp'),str(WORK/'geometry-deps')]
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_EDGE,TopAbs_IN,TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.gp import gp_Pnt
from shapely.geometry import Point,Polygon,LineString
from shapely.ops import unary_union
from native_beam_geometry import explore,face_geometry
def build_edge_evidence(inp):
 output=[]
 for key in ['even','odd']:
  reader=STEPControl_Reader();assert reader.ReadFile(str(WORK/'solid-input'/(key+'.step'))).value==1;reader.TransferRoots();shape=reader.OneShape();faces={};classifiers=[]
  for si,solid in enumerate(explore(shape,TopAbs_SOLID,TopoDS.Solid),1):
   classifiers.append(BRepClass3d_SolidClassifier(solid))
   for fi,f in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):faces[f'{key}-B{si}-F{fi}']=f
  def inside(p,h):
   for c in classifiers:
    c.Perform(gp_Pnt(p[0],h,-p[1]),.005)
    if c.State() in (TopAbs_IN,TopAbs_ON):return True
   return False
  for group in inp['groups']:
   if group['key']!=key:continue
   edges=[]
   for fid in group['sourceFaces']:
    face=faces[fid];foot=face_geometry(face);source=next(s for s in inp['sources'] if s['sourceFace']==fid);height=source['bottom']
    for ei,edge in enumerate(explore(face,TopAbs_EDGE,TopoDS.Edge),1):
     c=BRepAdaptor_Curve(edge);a,z=c.FirstParameter(),c.LastParameter()
     def xy(t):
      p=c.Value(t);return [p.X(),-p.Z()]
     pts=[xy(a+(z-a)*i/24) for i in range(25)];length=sum(math.dist(p,q) for p,q in zip(pts,pts[1:]))
     if length<20:continue
     checks=[];norm=None
     for ratio in [.25,.5,.75]:
      t=a+(z-a)*ratio;p=xy(t);p0=xy(t-(z-a)*.0001);p1=xy(t+(z-a)*.0001);u=[p1[k]-p0[k] for k in range(2)];l=math.hypot(*u)
      if l<1e-9:continue
      n=[-u[1]/l,u[0]/l];left=[p[k]+n[k]*.5 for k in range(2)];right=[p[k]-n[k]*.5 for k in range(2)];il=foot.covers(Point(left));ir=foot.covers(Point(right))
      if il==ir:checks.append(dict(type='pending'));continue
      inn,out=(left,right) if il else (right,left);outn=[-v for v in n] if il else n
      ia=inside(inn,height+.5);ib=inside(inn,height-.5);oa=inside(out,height+.5);ob=inside(out,height-.5)
      typ='yang' if ia and not ib and not oa and not ob else 'yin' if ia and not ib and oa and ob else 'coplanar' if ia and not ib and oa and not ob else 'pending'
      checks.append(dict(type=typ,insideAbove=ia,insideBelow=ib,outsideAbove=oa,outsideBelow=ob));
      if ratio==.5:norm=outn
     kinds={q['type'] for q in checks};typ=next(iter(kinds)) if len(kinds)==1 else 'pending';mid=pts[12]
     edges.append(dict(id=fid+'/E'+str(ei),sourceFace=fid,type=typ,start=pts[0],end=pts[-1],at=mid,outward=norm,points=pts if c.GetType().name!='GeomAbs_Line' else [pts[0],pts[-1]],length=round(length,3),bottom=height,checks=checks,evidence='原生三维梁底边内外及上下实体核验；非平面凹角推断'))
   boundary=[]
   for si,source in enumerate(s for s in inp['sources'] if s['groupId']==group['id']):
    for ri,reg in enumerate(source['region']):
     poly=Polygon(reg['polygon'],reg.get('holes',[])).simplify(.025,preserve_topology=True)
     for hi,ring in enumerate([poly.exterior,*poly.interiors]):
      coords=list(ring.coords)
      for ei,(a,b) in enumerate(zip(coords,coords[1:])):
       length=math.dist(a,b)
       if length<20:continue
       u=[(b[k]-a[k])/length for k in range(2)];n=[-u[1],u[0]];checks=[];outward=None
       for ratio in [.25,.5,.75]:
        mid=[a[k]+ratio*(b[k]-a[k]) for k in range(2)];left=[mid[k]+n[k]*.5 for k in range(2)];right=[mid[k]-n[k]*.5 for k in range(2)]
        il,ir=poly.covers(Point(left)),poly.covers(Point(right))
        if il==ir:checks.append(dict(type='pending'));continue
        inn,outer=(left,right) if il else (right,left);outn=[-v for v in n] if il else n;h=source['bottom']
        ia,ib,oa,ob=inside(inn,h+.5),inside(inn,h-.5),inside(outer,h+.5),inside(outer,h-.5)
        typ='yang' if ia and not ib and not oa and not ob else 'yin' if ia and not ib and oa and ob else 'coplanar' if ia and not ib and oa and not ob else 'pending'
        checks.append(dict(type=typ,insideAbove=ia,insideBelow=ib,outsideAbove=oa,outsideBelow=ob))
        if ratio==.5:outward=outn
       kinds={c['type'] for c in checks};typ=next(iter(kinds)) if len(kinds)==1 else 'pending'
       boundary.append(dict(id=f"B{si+1}-{ri+1}-{hi+1}-{ei+1}",sourceFace=source['sourceFace'],type=typ,start=list(a),end=list(b),points=[list(a),list(b)],at=[(a[k]+b[k])/2 for k in range(2)],outward=outward,length=length,bottom=source['bottom'],checks=checks))
   output.append(dict(id=group['id'],edges=edges,boundaryEdges=boundary))
 result=dict(version=1,source='original native STEP snapshot',rule='阳线：实体仅在内上侧；阴线：外侧实体向下延续；共面接缝不称阴阳线；证据不一致列待核实',groups=output)
 return result

if __name__=='__main__':
 inp=json.loads((SITE/'stage1/ordinary-input.json').read_text(encoding='utf8'))
 result=build_edge_evidence(inp)
 (SITE/'stage1/ordinary-edge-input.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf8')
 print(dict(groups=len(result['groups']),boundaryEdges=sum(len(g['boundaryEdges']) for g in result['groups'])))
