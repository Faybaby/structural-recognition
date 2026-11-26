from pathlib import Path
import sys,json,math
SITE=Path(__file__).resolve().parents[2];WORK=SITE.parent
sys.path[:0]=[str(WORK/'geometry-deps'),str(WORK/'solid-input/ocp')]
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from native_beam_geometry import axes,stitch,at
def line(a,b):return dict(type='line',start=a,end=b,length=math.dist(a,b),gw=200)
g=Polygon([[0,0],[2000,0],[4000,0],[4000,200],[2000,200],[0,200]])
paths=axes(g,[]);runs=stitch(paths,g);assert len(runs)==1 and abs(runs[0]['path']['length']-4000)<1e-6
runs=stitch([line([0,100],[2000,100]),line([2000,100],[4000,100])],g);assert len(runs)==1 and runs[0]['path']['length']==4000
arc=dict(type='arc',center=[1000,600],radius=500,angle=-math.pi/2,sweep=math.pi/2,length=math.pi*250,gw=200)
parts=[line([0,100],[1000,100]),arc,line([1500,600],[1500,2000])]
points=[]
for p in parts:points.extend([at(p,p['length']*i/100) for i in range(101)])
runs=stitch(parts,LineString(points).buffer(100));assert len(runs)==1;assert abs(runs[0]['path']['length']-sum(p['length'] for p in parts))<1e-6
T=unary_union([Polygon([[0,0],[4000,0],[4000,200],[0,200]]),Polygon([[1900,0],[2100,0],[2100,2000],[1900,2000]])]);tr=stitch(axes(T,[]),T);assert len(tr)==3
inp=json.loads((SITE/'stage1/ordinary-input.json').read_text(encoding='utf8'));sources={s['face']:s for s in inp['sources']}
def geom(s):return unary_union([Polygon(r['polygon'],r['holes']) for r in s['region']])
owner={}
for group in inp['groups']:
 for face in group['sourceFaces']:assert face not in owner;owner[face]=group['id']
 assert geom(group).symmetric_difference(unary_union([geom(sources[f]) for f in group['sourceFaces']])).area<.01
 for face in group['sourceFaces']:assert sources[face]['bottom'] in group['levels']
rebates=inp['rebateEvidence']['features'];assert len(rebates)==62
for merge in inp['rebateEvidence']['merges']:
 assert 0<merge['heightDifference']<=20.025
 assert merge['rebateSources']
 assert all(any(q['source']==h and q['key']==merge['key'] for q in rebates) for h in merge['rebateSources'])
 assert geom(sources[merge['faces'][0]]).distance(geom(sources[merge['faces'][1]]))<=.05
assert len(inp['groups'])==115 and len(owner)==133
circled=next(g for g in inp['groups'] if 'even-B2-F49' in g['sourceFaces']);assert 'even-B2-F31' in circled['sourceFaces'];assert circled['levels']==[2430,2450]
report=dict(passed=True,nativeFaces=len(owner),logicalBeams=len(inp['groups']),rebateMerges=len(inp['rebateEvidence']['merges']),rebateFeatures=62,circledBeam=circled['id'],circledOriginalRegions=len(circled['memberIds']),circledLevels=circled['levels'],checks=['drawing seam does not split native rectangle','collinear segments are one continuous route','line arc line is one continuous route using exact arc length','T branch is three internal routes within one plane','all group footprints are exact native unions','one native face has only one logical beam','every rebate merge has current DWG handle and native contact','actual source heights retained'])
(SITE/'calculation/stage1/native-plane-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
