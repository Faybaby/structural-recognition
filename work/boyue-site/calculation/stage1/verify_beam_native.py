"""Independent B-rep face and exact solid-ray verification of JS beam results."""
from pathlib import Path
import json,sys,math
SITE=Path(__file__).resolve().parents[2];WORK=SITE.parent
sys.path[:0]=[str(WORK/'solid-input/ocp'),str(WORK/'geometry-deps')]
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_IN,TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
from OCP.gp import gp_Pnt,gp_Dir,gp_Lin
import openpyxl
out=json.loads((WORK.parent/'outputs/挂梁支撑_含承接长度.json').read_text(encoding='utf8'))
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'))
faces={};rays={}
def explore(shape,kind,cast):
 e=TopExp_Explorer(shape,kind)
 while e.More():yield cast(e.Current());e.Next()
for key in ['even','odd']:
 reader=STEPControl_Reader();assert reader.ReadFile(str(WORK/'solid-input'/(key+'.step'))).value==1;reader.TransferRoots();shape=reader.OneShape()
 for si,solid in enumerate(explore(shape,TopAbs_SOLID,TopoDS.Solid),1):
  for fi,face in enumerate(explore(solid,TopAbs_FACE,TopoDS.Face),1):faces[f'{key}-B{si}-F{fi}']=face
 ray=IntCurvesFace_ShapeIntersector();ray.Load(shape,.005);rays[key]=ray
source=Path('C:/Users/Administrator/Documents/xwechat_files/wxid_3v1gew46nx6z22_969d/msg/file/2026-10/铝合金模板支撑间距索引表_V2.0.xlsx');sheet=openpyxl.load_workbook(source,data_only=True,read_only=True)['3000']
verified=0
for beam in out['beams']:
 if beam['status']!='passed':assert not beam['nodes'];continue
 assert sheet[beam['index']['cell']].value==beam['index']['spacing']
 for n in beam['nodes']:
  assert BRepClass_FaceClassifier(faces[n['sourceFace']],gp_Pnt(n['world'][0],n['sourceHeight'],-n['world'][1]),.02).State() in [TopAbs_IN,TopAbs_ON],n
  verified+=1
instances={i['id']:i for i in data['instances']};plans={p['key']:p for p in data['plans']};found=0;missing=0;error=0
for n in out['landings']['points']:
 source=instances[n['layer']];best=None
 for lower in data['instances']:
  if lower['order']>source['order']:continue
  plan=plans[lower['key']];x,y=n['world'];start=n['startHeight']-lower['offset']+plan['base'];ray=rays[lower['key']];ray.Perform(gp_Lin(gp_Pnt(x,start,-y),gp_Dir(0,-1,0)),.1,30000)
  for j in range(1,ray.NbPnt()+1):
   h=ray.Pnt(j).Y()-plan['base']+lower['offset']
   if h<n['startHeight']-.1 and (best is None or h>best[0]):best=(h,lower['id'])
 if n['status']=='missing':assert best is None;missing+=1;continue
 assert best is not None and best[1]==n['landing']['layer'];err=abs(best[0]-n['landing']['height']);assert err<.08;error=max(error,err);found+=1
report=dict(passed=True,nativeGLFacePoints=verified,nearestNativeLandings=found,noIntersectionVerified=missing,maxHeightErrorMm=error,indexSource='original XLSX 3000 sheet exact cells',geometrySnapshot='loaded original STEP snapshot, unchanged')
(SITE/'calculation/stage1/beam-native-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
