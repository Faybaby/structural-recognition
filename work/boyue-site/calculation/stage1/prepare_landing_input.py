"""Extract actual upward native mesh triangles, retaining face identity and holes."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2];WORK=ROOT.parent
out={"source":"loaded-native-snapshot","plans":{}}
for key in ['even','odd']:
 native=json.loads((WORK/'solid-input'/(key+'-native.json')).read_text(encoding='utf8'))
 faces=[]
 for body in native['bodies']:
  values=body['positions']
  for face in body['faces']:
   if face.get('plane') and face['normal'][1]<=0.0001:continue
   triangles=[]
   for i in range(face['meshStart']*3,(face['meshStart']+face['meshCount'])*3,9):
    a,b,c=[values[i+j:i+j+3] for j in [0,3,6]]
    if len(c)<3:continue
    # Projected determinant is the signed vertical component of the normal.
    ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])
    if abs(ny)<1e-5:continue
    if not face.get('plane') and ny<=0:continue
    triangles.append([[round(q[0],6),round(-q[2],6),round(q[1],6)] for q in [a,b,c]])
   if triangles:faces.append({"id":f"{key}-B{body['id']}-F{face['id']}","triangles":triangles})
 out['plans'][key]={'sha256':native['sha256'],'faces':faces}
(ROOT/'stage1/landing-input.json').write_text(json.dumps(out,separators=(',',':')),encoding='utf8')
print(json.dumps({k:{'faces':len(v['faces']),'triangles':sum(len(f['triangles']) for f in v['faces'])} for k,v in out['plans'].items()}))
