from pathlib import Path
import json,subprocess,hashlib,copy
from prepare_review_proposals import build,SITE
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'));before=copy.deepcopy(data);out=build(data);assert data==before
assert out['summary']==dict(total=38,candidate=6,protectedWidth=32,review=0)
assert all(not r['applied'] for r in out['rows'])
zones={z['id']:z for p in data['plans'] for z in p['zones']}
for r in out['rows']:
 assert all(zones[i]['kind']==r['kind'] for i in r['members'])
 assert 0<r['deltaHeight']<=50.001
 assert r['dominantArea']==max(r['areas'])
 if r['direction']=='width':assert r['status']=='protected-width' and r['proposed']=='不调整'
def fixture(polygons,kinds=('beam','beam'),delta=50):
 return dict(plans=[dict(key='test',zones=[dict(id=f'R{i}',kind=kinds[i],face=f'F{i}',bottom=i*delta,region=[dict(polygon=p,holes=[])]) for i,p in enumerate(polygons)])])
rect=lambda x0,y0,x1,y1:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]
width=fixture([rect(0,0,3000,200),rect(0,200,3000,250)]);assert build(width)['rows'][0]['status']=='protected-width'
length=fixture([rect(0,0,3000,200),rect(3000,0,3500,200)]);assert build(length)['rows'][0]['status']=='candidate'
assert not build(fixture([rect(0,0,3000,200),rect(3000,0,3500,200)],delta=51))['rows']
assert not build(fixture([rect(0,0,3000,200),rect(3000,0,3500,200)],kinds=('beam','slab')))['rows']
hashes={}
for name in ['data.json','floor-input.json','floor-core.js','landing-core.js']:
 p=SITE/'stage1'/name;original=subprocess.check_output(['git','-c','safe.directory='+str(SITE).replace('\\','/'),'show','c6dda4b8e427472f3671124341f473cc071f8c5a:stage1/'+name])
 assert original.replace(b'\r\n',b'\n')==p.read_bytes().replace(b'\r\n',b'\n'),name
 hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
report=dict(passed=True,proposals=out['summary'],allAppliedFalse=True,widthStepProtected=True,sameCategoryOnly=True,threshold50Inclusive=True,floorGeometryAndLandingAlgorithmsUnchanged=True,beamGLLRangeAuthorizedChange=[50,80],hashes=hashes,checks=['width-direction synthetic50mm step protected','length-direction step listed only','51mm step excluded','cross-category neighbor excluded','original geometry/floor/landing unchanged; beam range authorized separately'])
(SITE/'calculation/stage1/review-preservation-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
