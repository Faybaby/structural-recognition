"""Read the original XLSX and prepare floor regions only; no support layout reused."""
from pathlib import Path
import sys,json,zipfile,xml.etree.ElementTree as E,re,hashlib,collections
ROOT=Path(__file__).parent;WORK=ROOT.parent;SITE=WORK/'boyue-site'
sys.path.insert(0,str(WORK/'geometry-deps'))
from shapely.geometry import Polygon
from shapely.ops import unary_union
SOURCE=Path('C:/Users/Administrator/Documents/xwechat_files/wxid_3v1gew46nx6z22_969d/msg/file/2026-10/铝合金模板支撑间距索引表_V2.0.xlsx')
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(SOURCE) as z:
 strings=[''.join(q.itertext()) for q in E.fromstring(z.read('xl/sharedStrings.xml'))]
 wb=E.fromstring(z.read('xl/workbook.xml'));names=[s.attrib['name'] for s in wb.find('s:sheets',ns)];sheet=next(n for n in names if '板下' in n)
 relid=next(s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'] for s in wb.find('s:sheets',ns) if s.attrib['name']==sheet)
 rels=E.fromstring(z.read('xl/_rels/workbook.xml.rels'));target=next(r.attrib['Target'] for r in rels if r.attrib['Id']==relid);target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
 cells={}
 for c in E.fromstring(z.read(target)).findall('s:sheetData/s:row/s:c',ns):
  v=c.find('s:v',ns)
  if v is not None:cells[c.attrib['r']]=strings[int(v.text)] if c.attrib.get('t')=='s' else v.text
 columns={re.sub(r'\d','',k):int(v) for k,v in cells.items() if re.fullmatch('[B-Z]+2',k)};index=[]
 for address,text in cells.items():
  m=re.fullmatch(r'A(\d+)',address)
  if not m or int(m[1])<3 or not re.fullmatch(r'\d+mm',text):continue
  thickness=int(text[:-2]);row=int(m[1])
  for col,height in columns.items():
   cell=f'{col}{row}';value=cells.get(cell,'');pair=re.fullmatch(r'(\d+)[×xX](\d+)',value)
   if pair:index.append(dict(thickness=thickness,storyHeight=height,sx=int(pair[1]),sy=int(pair[2]),cell=cell,sourceValue=value))
assert next(x for x in index if x['thickness']==100 and x['storyHeight']==3000)['sx']==1300
data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'))
def g(z):return unary_union([Polygon(r['polygon'],r['holes']) for r in z['region']])
def region(geometry):
 polys=[geometry] if geometry.geom_type=='Polygon' else list(geometry.geoms)
 return [dict(polygon=[[round(x,3),round(y,3)] for x,y in list(p.exterior.coords)[:-1]],holes=[[[round(x,3),round(y,3)] for x,y in list(r.coords)[:-1]] for r in p.interiors]) for p in polys if p.geom_type=='Polygon' and not p.is_empty]
floors=[]
for plan in data['plans']:
 slabs=[z for z in plan['zones'] if z['kind']=='slab'];zs={z['id']:z for z in slabs};parent={z['id']:z['id'] for z in slabs}
 def find(x):
  while parent[x]!=x:x=parent[x]
  return x
 for group in plan.get('classGroups',[]):
  if group['category']!='slab':continue
  ids=[i for i in group['members'] if i in zs]
  for i in ids[1:]:parent[find(i)]=find(ids[0])
 groups=collections.defaultdict(list)
 for z in slabs:groups[find(z['id'])].append(z)
 for members in groups.values():
  geometry=unary_union([g(z) for z in members]);parts=region(geometry);thicknesses=[];evidence=[]
  for zone in members:
   values=[int(re.search(r'\bh\s*=\s*(\d+)',t['text'],re.I)[1]) for t in zone.get('labels',[]) if re.search(r'\bh\s*=\s*(\d+)',t['text'],re.I)]
   if 100<=zone['geometricDepth']<=250:values.append(round(zone['geometricDepth']))
   values.extend(q['thickness'] for q in zone.get('calculationThicknessReference',[]) if q['thickness'] is not None)
   thicknesses.extend(values);evidence.append(dict(id=zone['id'],face=zone['face'],geometricDepth=zone['geometricDepth'],labels=zone.get('labels',[]),references=zone.get('referenceRegions',[])))
  thickness=max(thicknesses) if thicknesses else None
  holes=[]
  for ri,r in enumerate(parts):
   for hi,h in enumerate(r['holes']):
    box=Polygon(h).minimum_rotated_rectangle;pts=list(box.exterior.coords);dims=sorted([((pts[i][0]-pts[i+1][0])**2+(pts[i][1]-pts[i+1][1])**2)**.5 for i in [0,1]])
    holes.append(dict(id=f'H{len(holes)+1:02}',polygon=h,width=round(dims[0],3),length=round(dims[1],3),small=all(d<1000-.001 for d in dims)))
  ident=plan['key']+'/'+min(z['id'] for z in members)
  floors.append(dict(id=ident,key=plan['key'],name=min(z['id'] for z in members),memberIds=[z['id'] for z in members],memberBaselineKeys=[plan['key']+'/'+z['id'] for z in members],region=parts,holes=holes,area=round(geometry.area/1e6,5),thickness=thickness,thicknesses=sorted(set(thicknesses)),thicknessEvidence=evidence,members=[{k:z[k] for k in ['id','face','bottom','top','region']} for z in members],nativeBase=plan['base']))
parent={f['id']:f['id'] for f in floors};pairs=[]
def find(x):
 while parent[x]!=x:x=parent[x]
 return x
geoms={f['id']:g(f) for f in floors}
for i,a in enumerate(floors):
 for b in floors[i+1:]:
  if a['key']==b['key']:continue
  overlap=geoms[a['id']].intersection(geoms[b['id']])
  if overlap.area>1:parent[find(a['id'])]=find(b['id']);pairs.append(dict(a=a['id'],b=b['id'],area=round(overlap.area/1e6,6)))
groups=collections.defaultdict(list)
for f in floors:groups[find(f['id'])].append(f['id'])
overlapGroups=[]
for i,ids in enumerate(groups.values(),1):
 gid='FLOOR-ALIGN-'+str(i).zfill(3);overlapGroups.append(dict(id=gid,floors=ids,pairs=[p for p in pairs if p['a'] in ids and p['b'] in ids]))
 for f in floors:
  if f['id'] in ids:f['alignmentGroup']=gid
out=dict(storyHeight=3000,source=dict(file=SOURCE.name,sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),sheet=sheet),index=index,floors=floors,overlapGroups=overlapGroups,modelGeometryKey=[data['drawingSha256']]+[p['sha256'] for p in data['plans']],rules=dict(fixedSpacing=True,spacingDeduction=0,modulus=50,minEndInclusive=500,maxEndDeduction=100,smallHoleMaxExclusive=1000,smallHoleEitherGapExclusive=150,largeHoleLongMinInclusive=1000,largeHoleShortMinInclusive=800,holeOuterOffsetDefault=100,holeOuterOffsetRangeInclusive=[80,140],otherHoleClearance=150,priority='well-grid',nativeHeightsPreserved=True))
(SITE/'stage1/floor-input.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps({'floors':len(floors),'groups':len(overlapGroups),'index3000':[x for x in index if x['storyHeight']==3000 and x['thickness'] in [100,120,150]],'sizes':[len(g['floors']) for g in overlapGroups]},ensure_ascii=True))
