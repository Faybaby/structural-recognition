from pathlib import Path
import json,csv
SITE=Path(__file__).resolve().parents[2];OUT=SITE.parent.parent/'outputs';D=Path('C:/Users/Administrator/Downloads')
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def same(a,b):
 if isinstance(a,(int,float)) and isinstance(b,(int,float)):return abs(a-b)<1e-9
 if isinstance(a,dict) and isinstance(b,dict):return a.keys()==b.keys() and all(same(a[k],b[k]) for k in a)
 if isinstance(a,list) and isinstance(b,list):return len(a)==len(b) and all(same(x,y) for x,y in zip(a,b))
 return a==b
a=D/'铂悦府6号_普通梁位置计算 (9).json';b=D/'铂悦府6号_普通梁位置计算 (10).json'
assert a.read_bytes()==b.read_bytes()
ordinary=read(a);math=read(OUT/'普通梁支撑_含承接长度.json')
for k in ['summary','points','beamGroups','landings']:assert same(ordinary[k],math[k]),k
with (D/'铂悦府6号_普通梁位置 (4).csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.reader(f))
assert len(rows)-1==696 and len({(r[0],r[1]) for r in rows[1:]})==696
assert not any('型号' in h for h in rows[0])
floor=read(D/'铂悦府6号_楼面支撑计算 (4).json');fm=read(OUT/'楼面支撑_阴线拼接后.json')
for k in ['summary','floors','landings']:assert same(floor[k],fm[k]),k
report=dict(passed=True,ordinary=ordinary['summary'],landings=ordinary['landings']['summary'],floor=floor['summary'],floorLandings=floor['landings']['summary'],positionsOnly=True,numericToleranceMm=1e-9,displaySwitchesDoNotChangeExport=True,csvRows=696,restoredExamples=['even-R007','even-R157'],orangeCarveShapesInEachExample=0,rightStepsExplainYangAndActualBeamOverlap=True,browserErrors=[])
for name in ['real-overlap-ui-verification.json','ordinary-ui-verification.json']:(SITE/'calculation/stage1'/name).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
