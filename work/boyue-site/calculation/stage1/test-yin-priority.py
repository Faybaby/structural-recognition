"""Regression against the deployed input: preserve original endpoint evidence."""
from pathlib import Path
import json, subprocess

SITE=Path(__file__).resolve().parents[2]
old=json.loads(subprocess.check_output(['git','show','d78f4b4e77c1b619ad3b014286979ed0efeaf279:stage1/ordinary-input.json'],cwd=SITE))
new=json.loads((SITE/'stage1/ordinary-input.json').read_text(encoding='utf8'))
assert old['groups']==new['groups'] and old['sources']==new['sources']
assert old['junctionGuides']==new['junctionGuides']
changed=[];native_yin=0;native_yang=0
for before,after in zip(old['beams'],new['beams'],strict=True):
    assert before['id']==after['id']
    for k in before:
        if k!='ends':assert before[k]==after[k],(after['id'],k)
    for i,(a,b) in enumerate(zip(before['ends'],after['ends'],strict=True)):
        for k in ['at','probeXY','inside','branch']:assert a[k]==b[k]
        original_yin=any(a['inside']) or a['branch'] or before['closed']
        if original_yin:
            native_yin+=1;assert b['type']=='yin'
        elif not b['partitionYin']:
            native_yang+=1;assert b['type']=='yang'
        if a['type']!=b['type']:
            assert a['type']=='yang' and b['type']=='yin'
            assert original_yin or b['partitionYin']
            changed.append(dict(beam=after['id'],end=i,reason=b['evidence']))
assert changed and native_yang
example=[b for b in new['beams'] if b['groupId']=='even/PB023']
assert len(example)==2 and all(e['type']=='yin' for b in example for e in b['ends'])
for name in ['partition-input.json','data.json','floor-input.json','beam-input.json','beam-core.js']:
    assert (SITE/'stage1'/name).read_bytes().replace(b'\r\n',b'\n')==subprocess.check_output(['git','show',f'd78f4b4e77c1b619ad3b014286979ed0efeaf279:stage1/{name}'],cwd=SITE).replace(b'\r\n',b'\n'),name
report=dict(passed=True,originalYinEndsPreserved=native_yin,trueYangEndsPreserved=native_yang,correctedEnds=len(changed),changes=changed,sourceGeometryAndPartitionsUnchanged=True,floorAndGLUnchanged=True)
(SITE/'calculation/stage1/yin-priority-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='changes'}))
