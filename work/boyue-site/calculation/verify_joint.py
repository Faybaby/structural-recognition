import json,sys,collections,csv,io,zipfile,hashlib,shutil
from pathlib import Path
ROOT=Path(__file__).parent
sys.path.insert(0,str(ROOT.parent/'geometry-deps'))
from shapely.geometry import Polygon,Point,LineString
from shapely.ops import unary_union
from gl_effective import index_for,all_hosts
from compact_floor import coverage_missing,spacing_pass
from overlap_calculation import clean
data=json.loads((ROOT/'joint-split-result.json').read_text(encoding='utf-8'))
views=data['views'];plans={p['key']:p for p in data['plans']}
geometry=lambda v:unary_union([Polygon(r['polygon'],r['holes']) for r in v['regions']])
gs={k:geometry(v) for k,v in views.items()}
checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
for a,b in [('overlap','odd'),('overlap','even'),('odd','even')]:check(a+'/'+b+' interiors disjoint',gs[a].intersection(gs[b]).area<1)
over_sets=[]
for k,p in plans.items():
 wall_polys=[Polygon(w['polygon']) for w in p['walls'] if '墙' in w.get('layer','') or '柱' in w.get('layer','')]
 footprint=clean(unary_union([Polygon(b['polygon']) for b in all_hosts(p)]+[Polygon(s['polygon'],s.get('holes',[])) for s in p['slabs']]).difference(unary_union(wall_polys)).difference(unary_union([Polygon(h['polygon']) for h in p['openings']])))
 check(k+' area conserved from source footprint',footprint.symmetric_difference(gs['overlap'].union(gs[k])).area<5)
 ns=p['nodes'];check(k+' no duplicate positions',len(ns)==len({tuple(n['at']) for n in ns}))
 holes=unary_union([Polygon(h['polygon']) for h in p['openings']]);check(k+' all node centers clear holes150',all(holes.distance(Point(n['at']))>=150-1e-6 for n in ns))
 over_sets.append({tuple(n['at']) for n in ns if n['inOverlap']})
 for vkey in ['overlap',k]:
  check(k+' '+vkey+' nodes within own region',all(gs[vkey].buffer(.11).covers(Point(n['at'])) for n in views[vkey]['nodes']))
 check(k+' difference excludes overlap',all(not gs['overlap'].covers(Point(n['at'])) for n in views[k]['nodes']))
 walls=unary_union([Polygon(w['polygon']) for w in p['walls'] if '墙' in w.get('layer','') or '柱' in w.get('layer','')])
 for n in ns:
  if n['kind']!='梁':continue
  recs=views['overlap' if n['inOverlap'] else k]['beams'];relevant=[b for b in recs if b['limit'] and Polygon(b['polygon']).buffer(.11).covers(Point(n['at']))]
  # Both layers' actual wall geometry is used for a shared beam point.
  wall=unary_union([Polygon(w['polygon']) for pp in plans.values() for w in pp['walls'] if '墙' in w.get('layer','') or '柱' in w.get('layer','')]) if n['inOverlap'] else walls
  check(k+' wall threshold '+n['id'],all(wall.distance(Point(n['at']))>=b['limit']-1e-6 for b in relevant))
 for s in p['slabs']:
  q=s['layout'];check(k+' floor check truthful '+s['id'],q['passed']==(q['spacingPass'] and q['coverageMissing']<=1 and(q['actualMinimumOpeningDistance'] is None or q['actualMinimumOpeningDistance']>=150-1e-6)))
check('upper/lower overlap coordinates exactly equal',over_sets[0]==over_sets[1])
check('view overlap unique coordinates matches both layers',over_sets[0]=={tuple(n['at']) for n in views['overlap']['nodes']})
rounded=[]
for v in views.values():
 for b in v['beams']:
  check('effective height max '+b['id'],b['depth']==max(q['effectiveHeight'] for q in b['parameterSources']))
  for q in b['parameterSources']:
   if q['gl']:
    heights=[int(t.upper().replace('×','X').split('X')[-1]) for t in q['gl']]
    check('GL priority '+b['id']+q['layer'],q['effectiveHeight']==max(heights))
  for r in b['widthLookupRecords']:
   row=index_for(r['entityWidth'],r['height'],[r['thickness']]);check('ceiling exact lookup '+b['id'],row and row['LookupWidth']==r['lookupWidth'] and row['S']==r['index'])
   if r['entityWidth']==150:rounded.append(r);check('150 lookup200 '+b['id'],r['lookupWidth']==200)
check('150 exercised',bool(rounded))
check('GL no missing widths',all(g['lookupWidth']>=g['entityWidth'] for p in plans.values() for g in p['glBeams']))
check('GD keeps physical150',any(n['model']=='GD100X150' for p in plans.values() for n in p['nodes']))
check('wall cancellation always distance below spacing',all(q['distance']<q['limit'] for q in data['wallRemoved']))
report=dict(passed=True,checks=len(checks),views={k:dict(nodes=len(v['nodes']),beams=len(v['beams']),GL=len(v['glBeams']),pendingGL=sum(g['index'] is None for g in v['glBeams']),reviewRecords=len(v['issues'])) for k,v in views.items()},physicalSupportCount=sum(len(p['nodes']) for p in plans.values()),widthRule='150→200 and successive upward lookup; physical GD width unchanged',unresolved='Beam end/spacing, source geometry and construction records remain in review lists; no global minimum proof')
out=ROOT.parent.parent/'outputs';out.mkdir(exist_ok=True)
(out/'三分区校核报告.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(out/'铂悦府6号_三分区_GL取档计算明细.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('校核报告.json',json.dumps(report,ensure_ascii=False,indent=2))
 z.writestr('完整计算过程.json',json.dumps(data,ensure_ascii=False))
 for k,v in views.items():
  for field in ['nodes','beams','glBeams','wallCancelled','issues']:
   rows=v[field];cols=list(dict.fromkeys(c for r in rows for c in r));buf=io.StringIO();w=csv.writer(buf);w.writerow(cols)
   for r in rows:w.writerow([json.dumps(r.get(c),ensure_ascii=False) if isinstance(r.get(c),(dict,list)) else r.get(c,'') for c in cols])
   z.writestr(v['name']+'_'+field+'.csv','\ufeff'+buf.getvalue())
print(json.dumps(report,ensure_ascii=True))
