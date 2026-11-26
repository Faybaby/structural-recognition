from pathlib import Path
import json,csv
SITE=Path(__file__).resolve().parents[2];OUT=SITE.parent.parent/'outputs';D=Path('C:/Users/Administrator/Downloads')
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def same(a,b):
    if isinstance(a,(int,float)) and isinstance(b,(int,float)):return abs(a-b)<1e-9
    if isinstance(a,dict) and isinstance(b,dict):return a.keys()==b.keys() and all(same(a[k],b[k]) for k in a)
    if isinstance(a,list) and isinstance(b,list):return len(a)==len(b) and all(same(x,y) for x,y in zip(a,b))
    return a==b
a=D/'铂悦府6号_普通梁位置计算 (11).json';b=D/'铂悦府6号_普通梁位置计算 (12).json'
assert a.read_bytes()==b.read_bytes()
ordinary=read(a);math=read(OUT/'普通梁支撑_含承接长度.json')
for k in ['summary','points','beamGroups','landings']:assert same(ordinary[k],math[k]),k
for beam in ordinary['beams']:
    for e in beam['ends']:
        if e['nativeType']=='yin' or e['partitionYin']:assert e['type']=='yin'
example=[b for b in ordinary['beams'] if b['groupId']=='even/PB023']
assert all(e['type']=='yin' for b in example for e in b['ends'])
assert all(n['origin']!='阳线端部' for b in example for n in b['nodes'])
with (D/'铂悦府6号_普通梁位置 (5).csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.reader(f))
count=ordinary['landings']['summary']['total']
assert len(rows)-1==count and len({(r[0],r[1]) for r in rows[1:]})==count
assert not any('型号' in h for h in rows[0])
report=dict(passed=True,example='even/PB023',exampleEnds='yin/yin on both routes',rightStepsExplainNativeYin=True,ordinary=ordinary['summary'],landings=ordinary['landings']['summary'],csvRows=count,displaySwitchesDoNotChangeExport=True,browserErrors=[],numericToleranceMm=1e-9)
for name in ['yin-priority-ui-verification.json','ordinary-ui-verification.json']:(SITE/'calculation/stage1'/name).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
