"""Verify browser landing distances independently against original STEP solids."""
from pathlib import Path
import sys,json,math
ROOT=Path(__file__).parent;WORK=ROOT.parent;SITE=WORK/'boyue-site'
sys.path[:0]=[str(WORK/'solid-input/ocp'),str(WORK/'geometry-deps')]
from OCP.STEPControl import STEPControl_Reader
from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
from OCP.gp import gp_Pnt,gp_Dir,gp_Lin
out=json.loads((WORK.parent/'outputs/楼面支撑_含承接面长度.json').read_text(encoding='utf8'))
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'))
intersectors={}
for key in ['even','odd']:
 reader=STEPControl_Reader();assert reader.ReadFile(str(WORK/'solid-input'/(key+'.step'))).value==1;reader.TransferRoots()
 obj=IntCurvesFace_ShapeIntersector();obj.Load(reader.OneShape(),.005);intersectors[key]=obj
plans={p['key']:p for p in data['plans']};instances={i['id']:i for i in data['instances']}
verified=0;missing=0;maxerror=0
for point in out['landings']['points']:
 source=instances[point['layer']];best=None
 for lower in data['instances']:
  if lower['order']>source['order']:continue
  plan=plans[lower['key']];x,y=point['world'];start=point['startHeight']-lower['offset']+plan['base']
  obj=intersectors[lower['key']];obj.Perform(gp_Lin(gp_Pnt(x,start,-y),gp_Dir(0,-1,0)),.1,30000)
  for j in range(1,obj.NbPnt()+1):
   hit=obj.Pnt(j);height=hit.Y()-plan['base']+lower['offset']
   if height>=point['startHeight']-.1:continue
   if best is None or height>best['height']:best={'height':height,'layer':lower['id']}
 if point['status']=='missing':assert best is None,(point['id'],best);missing+=1;continue
 assert best is not None,point['id'];error=abs(best['height']-point['landing']['height']);assert error<.08,(point['id'],point['landing'],best,error)
 assert best['layer']==point['landing']['layer'];maxerror=max(maxerror,error);verified+=1
report={'passed':True,'nativeNearestLandingVerified':verified,'noNativeIntersectionVerified':missing,'crossLayerVerified':out['landings']['summary']['crossLayer'],'maxHeightErrorMm':maxerror,'method':'Independent exact STEP solid downward ray intersections; no display gaps or fixed story-height substitution','snapshot':'existing loaded original STEP geometry'}
(SITE/'calculation/stage1/landing-native-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
