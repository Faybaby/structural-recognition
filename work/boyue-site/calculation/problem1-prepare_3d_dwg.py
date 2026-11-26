from pathlib import Path
import json,struct,base64,shutil,math
ROOT=Path(__file__).parent;site=ROOT.parent/'boyue-site';data=json.loads((site/'model3d-data.json').read_text(encoding='utf-8'));dest=site/'dist/model3d-dwg';dest.mkdir(exist_ok=True)
jobs=[];manifest={}
for scope in ['odd','even','both']:
 plans=data['plans'] if scope=='both' else [p for p in data['plans'] if p['key']==scope];nodes=[];links=[];meshes=[]
 for p in plans:
  offset=data.get('config',{}).get('height',3000) if scope=='both' and p['key']=='even' else 0
  for body in p['meshes']:
   if body['helper']:continue
   raw=struct.unpack('<'+'f'*(len(base64.b64decode(body['positions']))//4),base64.b64decode(body['positions']));positions=[]
   for i in range(0,len(raw),3):positions.extend([raw[i],-raw[i+2],raw[i+1]-p['base']+offset])
   meshes.append(dict(positions=positions,layer='MODEL_'+p['key'].upper()))
  for n in p['nodes']:
   at=[n['at'][0],n['at'][1],n['at'][2]-p['base']+offset];nodes.append(dict(id=n['id'],model=n['model'],at=at,angle=n['angle']+(math.pi/2 if n.get('yang') else 0),layer='GD_SHARED' if n['shared'] else 'GD_'+p['key'].upper()))
   links.append(dict(a=[at[0],at[1],n.get('footing',{}).get('z',p['base'])-p['base']+offset],b=[at[0],at[1],at[2]-30],layer='GD_POSTS_SCHEMATIC'))
  for link in p.get('links',[]):links.append(dict(a=[link['a'][0],link['a'][1],link['a'][2]-p['base']+offset],b=[link['b'][0],link['b'][1],link['b'][2]-p['base']+offset],layer='GD_RODS_REQUIRED' if link.get('mandatory',False) else 'GD_RODS'))
 notes=[dict(at=[0,17500],height=150,text=f'BOYUE6 | NATIVE 3D MODEL SUPPORT TEST | {scope} | {len(nodes)} GD | units:mm'),dict(at=[0,17200],height=100,text='X/Y = registered plan; Z = vertical elevation. Viewing offsets excluded. Posts schematic.'),dict(at=[0,16900],height=100,text='Geometry from supplied SLDPRT; GD model/centers calculated on native bearing faces. Reviews in website.')]
 layers=[dict(name=n,color=c) for n,c in [('MODEL_ODD',9),('MODEL_EVEN',8),('GD_SHARED',4),('GD_ODD',30),('GD_EVEN',200),('GD_POSTS_SCHEMATIC',8),('GD_RODS_REQUIRED',3),('GD_RODS',8),('GD_IDS',8),('GD_NOTES',2)]]
 file=dest/(scope+'.dwg');jobs.append(dict(path=str(file.resolve()).replace('\\','/'),layers=layers,polylines=[],meshes=meshes,links=links,nodes=nodes,notes=notes));manifest[scope]=dict(file=str(file),nodes=len(nodes),triangles=sum(len(m['positions'])//9 for m in meshes),posts=len(links))
target=ROOT.parent/'dwg-export'
if not (target/'jobs-2d.json').exists():shutil.copy2(target/'jobs.json',target/'jobs-2d.json')
if not (target/'2d-export-verification.json').exists():shutil.copy2(target/'export-verification.json',target/'2d-export-verification.json')
(target/'jobs.json').write_text(json.dumps(jobs,separators=(',',':')),encoding='utf-8');(ROOT/'3d-dwg-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');print(json.dumps(manifest))
