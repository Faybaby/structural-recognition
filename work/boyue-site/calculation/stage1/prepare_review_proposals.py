"""Read-only step review. Never merge or write formal geometry/calculation inputs."""
from pathlib import Path
import sys,json,math,hashlib,collections
SITE=Path(__file__).resolve().parents[2];sys.path.insert(0,str(SITE.parent/'geometry-deps'))
from shapely.geometry import Polygon
from shapely.ops import unary_union
def geom(z):return unary_union([Polygon(r['polygon'],r['holes']) for r in z['region']])
def region(g):
 ps=[g] if g.geom_type=='Polygon' else list(getattr(g,'geoms',[]))
 return [dict(polygon=[list(v) for v in list(p.exterior.coords)[:-1]],holes=[[list(v) for v in list(h.coords)[:-1]] for h in p.interiors]) for p in ps if p.geom_type=='Polygon']
def direction(a,b,shared):
 if a['kind']=='slab':return 'surface','相邻同类楼面，仅列归并候选'
 dominant=max([a,b],key=lambda a:a['g'].area);g=dominant['g'];w=2*g.area/g.length
 if shared.length>1.6*w:return 'width','接触边沿主面长边延伸，为宽度方向台阶，保持原状'
 pts=list(g.minimum_rotated_rectangle.exterior.coords);edges=[(math.dist(pts[i],pts[i+1]),pts[i],pts[i+1]) for i in range(4)];_,p,q=max(edges);axis=[q[0]-p[0],q[1]-p[1]];axisnorm=math.hypot(*axis)
 lines=[shared] if shared.geom_type=='LineString' else [v for v in getattr(shared,'geoms',[]) if v.geom_type=='LineString']
 if not lines:return 'uncertain','接触方向不唯一，保持原状待核对'
 line=max(lines,key=lambda v:v.length);coords=list(line.coords);v=[coords[-1][i]-coords[0][i] for i in range(2)];norm=math.hypot(*v)
 if not norm:return 'uncertain','圆弧/闭合接触线方向不唯一，保持原状待核对'
 dot=abs(sum(axis[i]*v[i] for i in range(2))/(axisnorm*norm))
 if dot>.86:return 'width','接触边平行于主面长轴，为宽度方向台阶，保持原状'
 if dot<.5:return 'length','接触边横跨主面短边，为长度方向台阶，仅列候选'
 return 'uncertain','异形接触边与主面轴向不平行，保持原状待核对'
def build(data):
 rows=[]
 for plan in data['plans']:
  groups=collections.defaultdict(list)
  for z in plan['zones']:groups[(z['kind'],z['face'],z['bottom'])].append(z)
  atoms=[dict(id=min(z['id'] for z in zs),kind=k[0],face=k[1],bottom=k[2],members=[z['id'] for z in zs],g=unary_union([geom(z) for z in zs])) for k,zs in groups.items()]
  for i,a in enumerate(atoms):
   for b in atoms[i+1:]:
    delta=abs(a['bottom']-b['bottom'])
    if a['kind']!=b['kind'] or not(.001<delta<=50.001) or a['g'].distance(b['g'])>.06:continue
    shared=a['g'].boundary.intersection(b['g'].boundary)
    if shared.length<.2:shared=a['g'].boundary.intersection(b['g'].boundary.buffer(.04))
    if shared.length<.2:continue
    mode,reason=direction(a,b,shared);dominant=max([a,b],key=lambda q:q['g'].area);g=a['g'].union(b['g']);row=dict(id=f"{plan['key']}-CHECK-{len(rows)+1:03}",key=plan['key'],kind=a['kind'],direction=mode,status='protected-width' if mode=='width' else 'review' if mode=='uncertain' else 'candidate',applied=False,deltaHeight=delta,members=sorted(a['members']+b['members']),faces=[a['face'],b['face']],levels=[a['bottom'],b['bottom']],areas=[a['g'].area/1e6,b['g'].area/1e6],dominantFace=dominant['face'],dominantMembers=dominant['members'],dominantArea=dominant['g'].area/1e6,dominantBottom=dominant['bottom'],touchLength=shared.length,reason=reason,region=region(g),proposed='不调整' if mode=='width' else '待确认后再决定' if mode=='uncertain' else '同类别≤50mm，拟按最大真实底面归并',effect='未修改正式区域、GLL1范围、间距、位置、原生标高或承接长度')
    rows.append(row)
 return dict(version=1,applied=False,formalVersion=23,maxStepInclusive=50,sameCategoryOnly=True,widthStepsProtected=True,reference='largest-actual-native-face-area',rows=rows,summary=dict(total=len(rows),candidate=sum(r['status']=='candidate' for r in rows),protectedWidth=sum(r['status']=='protected-width' for r in rows),review=sum(r['status']=='review' for r in rows)))
if __name__=='__main__':
 data=json.loads((SITE/'stage1/data.json').read_text(encoding='utf8'));out=build(data);out['formalInputHashes']={name:hashlib.sha256((SITE/'stage1'/name).read_bytes()).hexdigest() for name in ['data.json','floor-input.json','beam-input.json','beam-core.js']}
 (SITE/'stage1/review-proposals.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8');print(json.dumps(out['summary']))
