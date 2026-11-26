"""Metamorphic recognition tests: project identity, translation, rotation, size, no DWG."""
from pathlib import Path
import sys,json,copy,math
HERE=Path(__file__).resolve().parent;WORK=HERE.parents[2];sys.path[:0]=[str(WORK/'geometry-deps'),str(HERE)]
from shapely.geometry import box,LineString,Polygon
from shapely.ops import unary_union
from stair_beam_rules import apply_stair_beam_rules,shape

def region(q):
 gs=[q] if q.geom_type=='Polygon' else list(q.geoms)
 return [dict(polygon=[list(p) for p in list(g.exterior.coords)[:-1]],holes=[[list(p) for p in list(h.coords)[:-1]] for h in g.interiors]) for g in gs if g.area>0]
def fixture(length,name,angle=0,offset=(0,0),drawing=True):
 key=name;gid=name+'/frame';face=name+'/native';xr=4000;mid=length/2
 native=unary_union([box(-100,0,100,mid),box(-100,mid,150,length),box(xr-150,0,xr+100,mid),box(xr-100,mid,xr+100,length),box(0,mid-50,xr,mid+50)])
 rad=math.radians(angle);u=[math.cos(rad),math.sin(rad)]
 def pt(p):return [offset[0]+u[0]*p[0]-u[1]*p[1],offset[1]+u[1]*p[0]+u[0]*p[1]]
 def rs(q):return [dict(polygon=[pt(p) for p in r['polygon']],holes=[[pt(p) for p in h] for h in r['holes']]) for r in region(q)]
 parts=[];rows=[]
 for j,(x,y0,y1,w) in enumerate([(0,0,mid,200),(25,mid,length,250),(xr-25,0,mid,250),(xr,mid,length,200)]):
  ident=gid+'/arm'+str(j);a,b=pt([x,y0]),pt([x,y1]);part=dict(id=ident+'/part',exempt=False,width=w,length=y1-y0,rule='native',region=rs(native));parts.append(part)
  rows.append(dict(id=ident,key=key,groupId=gid,path=dict(type='line',start=a,end=b,length=y1-y0,gw=w),start=a,end=b,length=y1-y0,width=w,gw=w,bottom=2600,height=400,thickness=120,sourceFace=face,memberIds=[face],issues=[],ends=[dict(type='yin',nativeType='yin',at=p,yinPriority=True) for p in [a,b]],calculationPart=part,caseMatch=dict(rule='ordinary',sideTypes=[]),region=rs(native)))
 group=dict(id=gid,key=key,region=rs(native),sourceFace=face,sourceFaces=[face],memberIds=[face],height=400,bottom=2600,levels=[2600],routes=[b['id'] for b in rows],calculationParts=parts,pendingParts=[])
 raw=dict(beams=rows,groups=[group],sources=[dict(id=face,key=key,groupId=gid,sourceFace=face,bottom=2600,region=rs(native))],rules={},coverage=[],storyHeight=3000,index=[dict(width=200,height=400,thickness=120,spacing=1300,storyHeight=3000,cell='fixture')])
 plan=dict(key=key,specialZones=[dict(id=key+'/flight',kind='stair-edge',region=rs(box(100,mid-40,xr-100,mid+40)))],drawingEvidence=[dict(source=key+'/guide'+str(j),kind='beam',region=rs(box(x-100,0,x+100,length))) for j,x in enumerate([0,xr])] if drawing else [])
 return raw,dict(plans=[plan]),dict(global_={'origin':pt([0,0]),'angleDeg':angle},expected=[pt([0,mid]),pt([xr,mid])],length=length)

cases=[]
for length in [1800,2600,5300]:
 for angle in [0,33,90]:
  for drawing in [False,True]:
   name='foreign-project-'+str(len(cases));raw,data,meta=fixture(length,name,angle,(17321,-8174),drawing);before=json.dumps(raw);out=apply_stair_beam_rules(raw,data);assert json.dumps(raw)==before;stair=[b for b in out['beams'] if b.get('stairBeam')];assert len(stair)==2,(name,out['stairRecognition']);assert all(abs(b['length']-length)<1e-6 and abs(b['gw']-200)<1e-6 for b in stair)
   for b in stair:assert shape(out['groups'][0]['region']).buffer(.05).covers(LineString([b['start'],b['end']]))
   again=apply_stair_beam_rules(out,data);assert len(again['beams'])==len(out['beams']);assert len([b for b in again['beams'] if b.get('stairBeam')])==2
   cases.append(dict(name=name,input=out,settings=dict(global_=meta['global_']),expectedCenters=meta['expected'],length=length,drawing=drawing,angle=angle))
raw,data,_=fixture(2600,'no-stair');data['plans'][0]['specialZones']=[];assert not apply_stair_beam_rules(raw,data)['stairRecognition']['recognized']
raw,data,_=fixture(2600,'gap');q=shape(raw['groups'][0]['region']).difference(box(-200,800,200,900));raw['groups'][0]['region']=region(q);out=apply_stair_beam_rules(raw,data);assert len(out['stairRecognition']['recognized'])==1;assert out['stairRecognition']['pending']
raw,data,_=fixture(2600,'different-levels');raw['beams'][1]['bottom']=2400;out=apply_stair_beam_rules(raw,data);assert len(out['stairRecognition']['recognized'])==1;assert any('高差' in p['reason'] for p in out['stairRecognition']['pending'])
text=(HERE/'stair_beam_rules.py').read_text('utf8');assert all(v not in text for v in ['PB011','PB012','15490','20110','even/','odd/','STAIR-L','STAIR-R'])
target=WORK/'generic-stair-validation';target.mkdir(exist_ok=True);(target/'fixtures.json').write_text(json.dumps(cases,ensure_ascii=False),encoding='utf8');report=dict(passed=True,transformedRecognitionCases=len(cases),withoutDrawing=sum(not c['drawing'] for c in cases),rotations=[0,33,90],lengths=[1800,2600,5300],renamedProjects=True,translation=True,missingStairDoesNotMatch=True,physicalGapIsNotBridged=True,realHeightStepNotMerged=True,inputImmutable=True,idempotent=True,noProjectSelectors=True);(target/'geometry-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
