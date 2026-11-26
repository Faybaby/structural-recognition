"""Apply reviewed component classifications to exact native/DWG region matches.

These are explicit model-specific classifications, not a universal width/height
threshold or a support-spacing rule. New geometry must be reviewed again.
"""
import json,hashlib
from pathlib import Path

def fingerprint(region):
 return hashlib.sha256(json.dumps(region,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def apply_classifications(data,rules_path):
 rules=json.loads(Path(rules_path).read_text(encoding='utf8'))
 assert data['drawingSha256']==rules['drawingSha256']
 applied=[]
 for plan in data['plans']:
  targets=[t for t in rules['targets'] if t['plan']==plan['key']]
  assert plan['sha256']==rules['modelHashes'][plan['key']]
  for target in targets:
   matches=[z for z in plan['zones'] if z['id']==target['id'] and z['face']==target['face']]
   assert len(matches)==1,('Classification target changed',target['id'])
   zone=matches[0]
   assert zone['bottom']==target['bottom'] and zone['top']==target['top']
   assert fingerprint(zone['region'])==target['regionSha256']
   assert sorted(s['source'] for s in zone['sources'])==target['drawingSources']
   assert zone['kind'] in ['slab','beam']
   zone['originalKind']='slab';zone['kind']='beam';zone['calculationCategory']='beam'
   zone['classificationRule']=rules['id']
   zone['classificationBasis']=rules['reason']
   zone['evidence']='三维实际下挂构件 + 二维边界对应 + 用户明确指定按梁处理'
   zone['notes']=list(dict.fromkeys(zone.get('notes',[])+[rules['reason'],'梁高保留实际三维几何高；梁宽按实体截面确认。后续采用梁下支撑计算规则，不采用楼面Sx/Sy规则。']))
   applied.append(dict(plan=plan['key'],id=zone['id'],face=zone['face']))
  for kind,key in [('slab','slabRegions'),('beam','beamRegions'),('gl','glRegions')]:plan['summary'][key]=sum(z['kind']==kind for z in plan['zones'])
  plan['summary']['userClassifiedBeamRegions']=len(targets)
 assert len(applied)==len(rules['targets'])
 data['classificationRules']=[{k:v for k,v in rules.items() if k!='targets'}|{'applied':applied}]
 return applied
