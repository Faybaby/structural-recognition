import sys,json,math,collections,zipfile,csv,io
from pathlib import Path
ROOT=Path(__file__).parent;sys.path.insert(0,str(ROOT.parent/'geometry-deps'))
from shapely.geometry import Polygon,Point,LineString
from shapely.ops import unary_union
from gl_effective import all_hosts,index_for
from overlap_calculation import clean
checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
geometry=lambda regions:unary_union([Polygon(r['polygon'],r.get('holes',[])) for r in regions])
datasets={k:json.loads((ROOT/('interface-'+k+'.json')).read_text(encoding='utf-8')) for k in ['independent','aligned']}
report={}
for mode,d in datasets.items():
 vs=d['views'];gs={k:geometry(v['regions']) for k,v in vs.items()};pmap={p['key']:p for p in d['plans']};geo=geometry(d['overlay']['geometricOverlapRegions']);halo=geometry(d['overlay']['associatedBeamRegions'])
 check(mode+' overlap excludes associated beam interior',gs['overlap'].intersection(halo).area<1)
 check(mode+' two difference views share only associated geometric overlap',gs['odd'].intersection(gs['even']).difference(geo.intersection(halo)).area<1)
 shared=[]
 for k,p in pmap.items():
  nodes=p['nodes'];ats={tuple(n['at']) for n in nodes};check(mode+k+' no duplicates',len(ats)==len(nodes))
  shared.append({tuple(n['at']) for n in nodes if n['inOverlap']})
  holes=unary_union([Polygon(h['polygon']) for h in p['openings']]);walls=unary_union([Polygon(w['polygon']) for w in p['walls'] if '墙' in w.get('layer','') or '柱' in w.get('layer','')]);hosts=all_hosts(p)
  footprint=clean(unary_union([Polygon(h['polygon']) for h in hosts]+[Polygon(s['polygon'],s.get('holes',[])) for s in p['slabs']]).difference(walls).difference(holes))
  check(mode+k+' view area conservation',footprint.symmetric_difference(gs['overlap'].union(gs[k])).area<5)
  check(mode+k+' view area non-duplicate',gs['overlap'].intersection(gs[k]).area<1)
  check(mode+k+' node count conservation',len(vs['overlap']['nodes'])+len(vs[k]['nodes'])==len(nodes))
  check(mode+k+' node positions conservation',{tuple(n['at']) for n in vs['overlap']['nodes']}|{tuple(n['at']) for n in vs[k]['nodes']}==ats)
  check(mode+k+' hole150',all(holes.distance(Point(n['at']))>=150-1e-6 for n in nodes))
  for hid in d['overlay']['associatedBeams'][k]:
   h=next(h for h in hosts if h['id']==hid);check(mode+k+' full adjacent beam '+hid,Polygon(h['polygon']).intersection(footprint).difference(gs[k]).area<5)
  for e in p['links']:
   check(mode+k+' link endpoints',tuple(e['a']) in ats and tuple(e['b']) in ats)
   if e.get('kind')!='arcChord':check(mode+k+' link support/spacing',footprint.buffer(.11).covers(LineString([e['a'],e['b']])) and e['length']<=e.get('limit',1200)+.11)
  for a in d['alignmentAudit']:
   if a['plan']!=k or a['kind']!='楼面':continue
   check(mode+k+' actual alignment ledger '+a['owner'],a['actualConnectionCount']==len(a['actualConnections']))
   check(mode+k+' unmatched alignment visible '+a['owner'],a['actualConnectionCount']>0 or any(q['id']==k+'-ALIGN-'+a['owner'] for q in p['issues']))
  for b in [*vs['overlap']['beams'],*vs[k]['beams']]:
   check(mode+k+' max height '+b['id'],b['depth']==max(q['effectiveHeight'] for q in b['parameterSources']))
   for r in b['widthLookupRecords']:
    row=index_for(r['entityWidth'],r['height'],[r['thickness']]);check(mode+k+' upward exact index '+b['id'],row['LookupWidth']==r['lookupWidth'] and row['S']==r['index'])
 check(mode+' paired upper/lower',shared[0]==shared[1])
 report[mode]=dict(views={k:dict(nodes=len(v['nodes']),beams=len(v['beams']),links=len(v['links']),issues=len(v['issues'])) for k,v in vs.items()},physicalCount=sum(len(p['nodes']) for p in pmap.values()),associatedPhysicalBeams={k:len(v) for k,v in d['overlay']['associatedBeams'].items()},floorInterfaces=[dict(plan=a['plan'],floor=a['owner'],connections=a['actualConnectionCount']) for a in d['alignmentAudit'] if a['kind']=='楼面'])
old={p['key']:{tuple(n['at']) for n in p['nodes']} for p in datasets['independent']['plans']};new={p['key']:{tuple(n['at']) for n in p['nodes']} for p in datasets['aligned']['plans']}
check('alignment actually changes coordinates',any(old[k]!=new[k] for k in old))
report['changedPositions']={k:dict(removed=len(old[k]-new[k]),added=len(new[k]-old[k])) for k in old};report['passed']=True;report['checks']=len(checks)
out=ROOT.parent.parent/'outputs';(out/'差异周边梁_对齐校核.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(out/'铂悦府6号_差异梁及对齐计算明细.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('校核报告.json',json.dumps(report,ensure_ascii=False,indent=2))
 for mode,d in datasets.items():
  z.writestr(mode+'/完整计算过程.json',json.dumps(d,ensure_ascii=False))
  for k,v in d['views'].items():
   for field in ['nodes','beams','issues']:
    rows=v[field];cols=list(dict.fromkeys(c for r in rows for c in r));buf=io.StringIO();w=csv.writer(buf);w.writerow(cols)
    for r in rows:w.writerow([json.dumps(r.get(c),ensure_ascii=False) if isinstance(r.get(c),(dict,list)) else r.get(c,'') for c in cols])
    z.writestr(mode+'/'+k+'_'+field+'.csv','\ufeff'+buf.getvalue())
print(json.dumps(report,ensure_ascii=True))
