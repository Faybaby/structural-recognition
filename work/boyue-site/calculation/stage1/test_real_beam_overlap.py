from pathlib import Path
import json,sys
SITE=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(SITE.parent/'geometry-deps'))
from shapely.geometry import box,Polygon,LineString
from shapely.ops import unary_union
from real_beam_overlap import qualified_overlap

slab=box(0,0,2000,2000)
beam=box(-100,500,300,1500)
yang=[LineString([(300,500),(300,1500)])]
assert qualified_overlap(slab,beam,yang)[0].area==300000
assert qualified_overlap(slab,beam,[])[0].is_empty
assert qualified_overlap(slab,box(-300,500,0,1500),[LineString([(0,500),(0,1500)])])[0].is_empty
assert qualified_overlap(slab,beam,[LineString([(-100,500),(-100,1500)])])[0].is_empty
# A rounded corner, a narrow strip or a concave slab does not create a beam.
assert qualified_overlap(slab,Polygon(),yang)[0].is_empty
part=json.loads((SITE/'stage1/partition-input.json').read_text(encoding='utf8'))
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'))
inp=json.loads((SITE/'stage1/ordinary-input.json').read_text(encoding='utf8'))
def geom(z):return unary_union([Polygon(r['polygon'],r.get('holes',[])) for r in z['region']])
for plan in data['plans']:
 actual_faces={z['face'] for z in plan['zones'] if z['kind']=='beam'}
 assert all(s['face'] in actual_faces for s in inp['sources'] if s['key']==plan['key'])
 for z in [z for z in plan['zones'] if z['kind']=='slab']:
  audit=next(a for a in part['overlapAudit'] if a['id']==z['id'])
  changed=geom(z).difference(geom(part['zoneOverrides'][z['id']])).area
  if not audit['applied']:assert changed<.1,z['id']
  else:assert audit['evidence'] and all(e['hasNativeYang'] and e['overlapArea']>0 for e in audit['evidence'])
for ident in ['even-R007','even-R157']:
 old=next(z for p in data['plans'] for z in p['zones'] if z['id']==ident)
 assert geom(old).symmetric_difference(geom(part['zoneOverrides'][ident])).area==0
 assert not next(a for a in part['overlapAudit'] if a['id']==ident)['applied']
report=dict(passed=True,rule='both native yang at overlap and actual beam area overlap',shapeInferenceDisabled=not part['shapeOnlyInference'],restoredExamples=['even-R007','even-R157'],auditedSlabs=len(part['overlapAudit']),qualifiedCarves=sum(a['applied'] for a in part['overlapAudit']),tests=['overlap+yang passes','overlap only rejects','edge contact rejects','yang outside overlap rejects','shape only rejects','native beam source required','unqualified slab geometry unchanged'])
(SITE/'calculation/stage1/real-overlap-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
