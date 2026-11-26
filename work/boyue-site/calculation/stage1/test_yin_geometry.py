"""Check native-mask coverage,陰線 splitting and slab/beam area conservation."""
from pathlib import Path
import json,sys
SITE=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(SITE.parent/'geometry-deps'))
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from yin_partition import yin_parts,narrow_arms
def geom(z):return unary_union([Polygon(r['polygon'],r.get('holes',[])) for r in z['region']])
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'))
inp=json.loads((SITE/'stage1/ordinary-input.json').read_text(encoding='utf8'))
part=json.loads((SITE/'stage1/partition-input.json').read_text(encoding='utf8'))
assert all(c['beamSlabOverlapArea']<.05 for c in part['checks'])
max_error=0
for g in inp['groups']:
 cells=unary_union([geom(c) for c in g['calculationParts']]);error=cells.symmetric_difference(geom(g)).area
 max_error=max(max_error,error);assert error<.1,(g['id'],error)
 for c in g['calculationParts']:
  if c['exempt']:assert c['yinNeck'] and c['width']<=200.025
  elif c['yinNeck']:assert c['width']>200.025
for plan in data['plans']:
 key=plan['key'];mask=unary_union([geom(s) for s in inp['sources'] if s['key']==key]+[geom(z) for z in plan['zones'] if z['kind']=='gl'])
 for old in [z for z in plan['zones'] if z['kind']=='slab']:
  q=geom(part['zoneOverrides'][old['id']]);original=geom(old)
  assert original.difference(q.union(mask)).area<.1,old['id']
  assert q.buffer(-.05).intersection(mask.buffer(-.05)).area<.05,old['id']
 # No original beam material disappears into a slab or an exempt missing mask.
 for old in [z for z in plan['zones'] if z['kind']=='beam']:
  # Original display contours and native circles use different chord samples.
  # 0.04mm covers their combined boundary approximation, not missing material.
  assert geom(old).difference(mask.buffer(.04)).area<.1,old['id']
old=next(z for z in data['plans'][0]['zones'] if z['id']=='even-R074')
assert geom(old).symmetric_difference(geom(part['zoneOverrides'][old['id']])).area<.1
mixed=next(g for g in inp['groups'] if 'even-B2-F553' in g['sourceFaces'])
slab=next(z for z in data['plans'][0]['zones'] if z['id']=='even-R076')
assert geom(mixed).intersection(geom(slab)).area<.05
report=dict(passed=True,logicalBeams=len(inp['groups']),parts=sum(len(g['calculationParts']) for g in inp['groups']),exemptParts=sum(c['exempt'] for g in inp['groups'] for c in g['calculationParts']),maxPartitionAreaErrorMm2=max_error,checks=['every calculation partition conserves native beam area','all original slab area remains slab or is explicitly carved as beam','no floor/beam overlap','original beam material retained','unqualified floorR074 remains slab','PB028 cannot contain its broad slab'])
(SITE/'calculation/stage1/yin-geometry-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
