"""Independent B-rep face and exact solid-ray verification of JS beam results."""
from pathlib import Path
import json,sys,math
SITE=Path(__file__).resolve().parents[2];WORK=SITE.parent
sys.path[:0]=[str(WORK/'solid-input/ocp'),str(WORK/'geometry-deps')]
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_IN,TopAbs_ON,TopAbs_REVERSED
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Plane
from OCP.BRepLProp import BRepLProp_SLProps
from OCP.TopoDS import TopoDS
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
from OCP.gp import gp_Pnt,gp_Dir,gp_Lin
import openpyxl
floor_mode=len(sys.argv)>1 and sys.argv[1]=='floor'
out=json.loads((Path(sys.argv[2]) if len(sys.argv)>2 else WORK.parent/('outputs/楼面支撑_阴线拼接后.json' if floor_mode else 'outputs/普通梁支撑_含承接长度.json')).read_text(encoding='utf8'))
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'))
uniform_pitch=out.get('uniformSpacing')
faces={};rays={}
def explore(shape,kind,cast):
 e=TopExp_Explorer(shape,kind)
 while e.More():yield cast(e.Current());e.Next()
for key in ['even','odd']:
 reader=STEPControl_Reader();assert reader.ReadFile(str(WORK/'solid-input'/(key+'.step'))).value==1;reader.TransferRoots();shape=reader.OneShape()
 for si,solid in enumerate(explore(shape,TopAbs_SOLID,TopoDS.Solid),1):
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):faces[f'{key}-B{si}-F{fi}']=face
 ray=IntCurvesFace_ShapeIntersector();ray.Load(shape,.005);rays[key]=ray
source=Path('C:/Users/Administrator/Documents/xwechat_files/wxid_3v1gew46nx6z22_969d/msg/file/2026-10/铝合金模板支撑间距索引表_V2.0.xlsx');sheet=openpyxl.load_workbook(source,data_only=True,read_only=True)[out['indexSource']['sheet'] if floor_mode else '3000']
verified=0
for beam in out['floors'] if floor_mode else out['beams']:
 if beam['status']!='passed':assert not beam['nodes'];continue
 if beam.get('uniformAlignment'):
  assert uniform_pitch and beam['index']['source']=='user-uniform'
  assert ([beam['index']['sx'],beam['index']['sy']]==[uniform_pitch,uniform_pitch] if floor_mode else beam['index']['spacing']==uniform_pitch)
 elif floor_mode:
  import re
  pair=[int(v) for v in re.findall(r'\d+',str(sheet[beam['index']['cell']].value))]
  assert pair==[beam['index']['sx'],beam['index']['sy']]
 else:assert sheet[beam['index']['cell']].value==beam['index']['spacing']
 for n in beam['nodes']:
  assert BRepClass_FaceClassifier(faces[n['sourceFace']],gp_Pnt(n['world'][0],n['sourceHeight'],-n['world'][1]),.02).State() in [TopAbs_IN,TopAbs_ON],n
  verified+=1
instances={i['id']:i for i in data['instances']};plans={p['key']:p for p in data['plans']};found=0;missing=0;error=0;mismatches=[]
for n in out['landings']['points']:
 source=instances[n['layer']];best=None
 for lower in data['instances']:
  if lower['order']>source['order']:continue
  plan=plans[lower['key']];x,y=n['world'];start=n['startHeight']-lower['offset']+plan['base'];ray=rays[lower['key']];ray.Perform(gp_Lin(gp_Pnt(x,start,-y),gp_Dir(0,-1,0)),.1,30000)
  for j in range(1,ray.NbPnt()+1):
   face=ray.Face(j);surface=BRepAdaptor_Surface(face);sign=-1 if face.Orientation()==TopAbs_REVERSED else 1
   normal=surface.Plane().Axis().Direction().Y()*sign if surface.GetType()==GeomAbs_Plane else BRepLProp_SLProps(surface,ray.UParameter(j),ray.VParameter(j),1,.001).Normal().Y()*sign
   if normal<=.0001:continue
   h=ray.Pnt(j).Y()-plan['base']+lower['offset']
   if h<n['startHeight']-.1 and (best is None or h>best[0]):best=(h,lower['id'])
 if n['status']=='missing':
  if best is not None:mismatches.append(dict(id=n['id'],world=n['world'],status=n['status'],best=best,start=n['startHeight']))
  missing+=1;continue
 if best is None or best[1]!=n['landing']['layer'] or abs(best[0]-n['landing']['height'])>=.08:mismatches.append(dict(id=n['id'],world=n['world'],status=n['status'],best=best,landing=n['landing'],start=n['startHeight']));continue
 err=abs(best[0]-n['landing']['height']);error=max(error,err);found+=1
report=dict(passed=not mismatches,upwardReceivingFacesOnly=True,mismatches=mismatches,nativeOrdinaryFacePointReferences=verified,nearestNativeLandings=found,noIntersectionVerified=missing,maxHeightErrorMm=error,indexSource=('user uniform spacing '+str(uniform_pitch)+'mm for marked regions; original XLSX for others' if uniform_pitch else 'original XLSX '+sheet.title+' sheet exact cells'),geometrySnapshot='loaded original STEP snapshot, unchanged')
(Path(sys.argv[3]) if len(sys.argv)>3 else SITE/('calculation/stage1/yin-floor-native-verification.json' if floor_mode else 'calculation/stage1/ordinary-native-verification.json')).write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
