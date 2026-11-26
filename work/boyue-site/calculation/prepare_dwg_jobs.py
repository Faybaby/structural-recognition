from pathlib import Path
import json,math
from gl_effective import all_hosts
ROOT=Path(__file__).parent;SITE=ROOT.parent/'boyue-site';OUT=ROOT.parent.parent/'outputs';DEST=SITE/'dist'/'dwg';DEST.mkdir(parents=True,exist_ok=True)
bundle=json.loads((SITE/'project-data.json').read_text(encoding='utf-8'));jobs=[]
layers=[dict(name=n,color=c) for n,c in [('GD_SHARED',4),('GD_ODD',30),('GD_EVEN',200),('GD_BEAMS',2),('GD_FLOORS',8),('GD_HOLES',1),('GD_RODS',3),('GD_REFERENCE',8),('GD_IDS',8),('GD_NOTES',2),('GD_REGION',6)]]
manifest={}
for mode,d in bundle['variants'].items():
 manifest[mode]={}
 for viewid in ['overlap','odd','even','full']:
  v=d['views'].get(viewid);raws=d['plans'];polys=[];nodes=[];links=[]
  def addpoly(points,layer,offset=0,closed=True):
   if len(points)>1:polys.append(dict(points=[[p[0]+offset,p[1]] for p in points],layer=layer,closed=closed))
  if v:
   for region in v['regions']:
    addpoly(region['polygon'],'GD_REGION')
    for h in region['holes']:addpoly(h,'GD_REGION')
   for b in v['beams']:addpoly(b['polygon'],'GD_BEAMS')
   for s in v['slabs']:addpoly(s['polygon'],'GD_FLOORS')
   offset=0 if viewid=='overlap' else next(p['offsetX'] for p in raws if p['key']==viewid)
   # Difference files return to their original DWG coordinates. Shared view stays registered.
   for poly in polys:
    for p in poly['points']:p[0]+=offset
   for n in v['nodes']:nodes.append(dict(id=n['id'],model=n['model'],at=[n['at'][0]+offset,n['at'][1]],angle=n['angle'],layer='GD_SHARED' if n['inOverlap'] else 'GD_ODD' if viewid=='odd' else 'GD_EVEN'))
   for e in [*v['links'],*v.get('interfaceLinks',[])]:links.append(dict(a=[e['a'][0]+offset,e['a'][1]],b=[e['b'][0]+offset,e['b'][1]],layer='GD_RODS'))
   for n in v.get('referenceNodes',[]):
    x,y=n['at'];addpoly([[x-80,y],[x+80,y]],'GD_REFERENCE',offset,False);addpoly([[x,y-80],[x,y+80]],'GD_REFERENCE',offset,False)
  else:
   for p in raws:
    offset=p['offsetX'];key=p['key'];shared=bundle['sharedPlans'][key]
    for s in p['slabs']:
     addpoly(s['polygon'],'GD_FLOORS',offset)
     for h in s.get('holes',[]):addpoly(h,'GD_HOLES',offset)
    for b in all_hosts(dict(p,**shared)):addpoly(b['polygon'],'GD_BEAMS',offset)
    for h in shared['openings']:addpoly(h['polygon'],'GD_HOLES',offset)
    for n in p['nodes']:nodes.append(dict(id=n['id'],model=n['model'],at=[n['at'][0]+offset,n['at'][1]],angle=n['angle'],layer='GD_SHARED' if n['inOverlap'] else 'GD_ODD' if key=='odd' else 'GD_EVEN'))
    for e in p['links']:links.append(dict(a=[e['a'][0]+offset,e['a'][1]],b=[e['b'][0]+offset,e['b'][1]],layer='GD_RODS'))
  name=f'{mode}-{viewid}.dwg';file=DEST/name
  nx=min(n['at'][0] for n in nodes);ny=max(n['at'][1] for n in nodes)+1000
  notes=[dict(at=[nx,ny],height=130,text=f'BOYUE6 GD TEST | {mode} | {viewid} | units:mm | supports:{len(nodes)}'),dict(at=[nx,ny-300],height=100,text='GL height first / width rounds upward / GD uses actual width / spacing=index-100 / hole center150'),dict(at=[nx,ny-600],height=100,text='Candidate layout - unresolved checks retained in website. GD_IDS labels may be hidden by layer.')]
  jobs.append(dict(path=str(file.resolve()).replace('\\','/'),layers=layers,polylines=polys,nodes=nodes,links=links,notes=notes))
  manifest[mode][viewid]=dict(filename=name,nodeCount=len(nodes),links=len(links),coordinates='registered local mm' if viewid=='overlap' else 'original DWG mm',url='dwg/'+name)
(ROOT.parent/'dwg-export/jobs.json').write_text(json.dumps(jobs,ensure_ascii=False),encoding='utf-8')
(SITE/'dwg-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
print(json.dumps({k:{v:q['nodeCount'] for v,q in m.items()} for k,m in manifest.items()}))
