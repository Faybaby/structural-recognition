import {regionBounds,splitThroughHole,holeEdgeStrips,coverageAxes,physicalShortSide} from './layout-zones.js';
import {isLargeHole,holeLayout} from './hole-core.js';
import {toBaseline,fromBaseline,normalizeAngle} from './baseline-core.js';
const EPS=1e-6;
const mod=(x,s)=>(x%s+s)%s;
export function ringContains(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[j],b=ring[i],cross=(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);
 if(Math.abs(cross)<1e-5&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS)return true;
 if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;}
export function regionContains(p,region){return region.some(r=>ringContains(p,r.polygon)&&!r.holes.some(h=>ringContains(p,h)));}
export function ringDistance(p,ring){let best=Infinity;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],d=[b[0]-a[0],b[1]-a[1]],l=d[0]*d[0]+d[1]*d[1],t=l?Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/l)):0;best=Math.min(best,Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]));}return best;}
function bounds(region){const p=region.flatMap(r=>r.polygon);return [Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];}
export function axisPositions(min,max,spacing,phase){
 const first=Math.ceil((min+500-phase-EPS)/spacing),last=Math.floor((max-500-phase+EPS)/spacing);
 const values=[];for(let i=first;i<=last;i++)values.push(phase+i*spacing);
 if(!values.length)return null;const h1=values[0]-min,h2=max-values.at(-1);
 if(!(h1>=500-EPS&&h2>=500-EPS&&h1<spacing-100-EPS&&h2<spacing-100-EPS))return null;
 return {values,h1,h2};
}
function rawIntervals(ring,level,vertical){const hits=[];for(let i=0;i<ring.length;i++){const q=ring[i],r=ring[(i+1)%ring.length],a=vertical?[q[1],q[0]]:q,b=vertical?[r[1],r[0]]:r;if((a[1]<=level&&b[1]>level)||(b[1]<=level&&a[1]>level))hits.push(a[0]+(level-a[1])*(b[0]-a[0])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);const out=[];for(let i=0;i+1<hits.length;i+=2)if(hits[i+1]-hits[i]>EPS)out.push([hits[i],hits[i+1]]);return out;}
function distanceToAxes(interval,axes){return Math.min(...axes.map(v=>v>=interval[0]-EPS&&v<=interval[1]+EPS?0:Math.min(Math.abs(v-interval[0]),Math.abs(v-interval[1]))));}
function transformRegion(region,base){return region.map(r=>({polygon:r.polygon.map(p=>toBaseline(p,base)),holes:r.holes.map(h=>h.map(p=>toBaseline(p,base)))}));}
function sameBase(a,b){return a.origin.every((v,i)=>Math.abs(v-b.origin[i])<EPS)&&Math.abs(normalizeAngle(a.angleDeg-b.angleDeg))<EPS;}
function context(floor,settings,input,allowSplit=true){
 const overrides=floor.memberBaselineKeys.map(k=>settings.locals[k]).filter(Boolean),base=overrides[0]||settings.global;
 const index=input.index.find(r=>r.thickness===floor.thickness&&r.storyHeight===input.storyHeight);
 const result={id:floor.id,key:floor.key,name:floor.name,memberIds:floor.memberIds,alignmentGroup:floor.alignmentGroup,thickness:floor.thickness,storyHeight:input.storyHeight,index:index||null,base:base||null,baselineSource:overrides.length?'局部基准':'整楼基准',status:'pending',reasons:[],nodes:[],gridSegments:[]};
 if(!base)result.reasons.push('尚未保存整楼基准点');
 if(overrides.some(b=>!sameBase(b,base)))result.reasons.push('同一连续楼面有多个不同局部基准，请先统一');
 if(!index)result.reasons.push('板厚/层高在原索引表中缺项');
 if(index&&(index.sx%50!==0||index.sy%50!==0))result.reasons.push('表值与50mm轴线模数不相容，未改变表值');
 if(result.reasons.length)return {floor,result,error:true};
 const region=transformRegion(floor.region,base),bb=bounds(region),holes=floor.holes.map(h=>({...h,large:isLargeHole(h),local:h.polygon.map(p=>toBaseline(p,base))}));
 const horizontal=new Map(),vertical=new Map();
 function intervals(value,v){const map=v?vertical:horizontal,key=value.toFixed(5);if(!map.has(key))map.set(key,region.flatMap(r=>rawIntervals(r.polygon,value,v)));return map.get(key);}
 for(const h of holes)if(h.large)h.layout=holeLayout(h,index.sx,index.sy,intervals,{allowBoundaryException:true});
 result.holePlans=holes.filter(h=>h.large).map(h=>({id:h.id,width:h.width,length:h.length,...h.layout}));
 result.dimensions=[bb[2]-bb[0],bb[3]-bb[1]];
 const minimum=Math.min(index.sx,index.sy)-100;result.narrowThreshold=minimum;result.narrowSize=physicalShortSide(region);
 if(result.narrowSize<minimum-EPS){result.status='exempt';result.layout='窄面免放';result.reasons=[`窄边${result.narrowSize.toFixed(1)}mm＜min(Sx,Sy)−100=${minimum}mm，按用户规则不放楼面支撑`];return {floor,result,exempt:true};}
 let parts=null;
 if(allowSplit&&holes.length===1&&holes[0].large&&!holes[0].layout.error){const hole={...holes[0],...holes[0].layout};result.excludedStrips=holeEdgeStrips(region,hole);const definitions=splitThroughHole(region,hole);if(definitions){parts=definitions.map((d,i)=>{const world=d.region.map(r=>({polygon:r.polygon.map(p=>fromBaseline(p,base)),holes:r.holes.map(h=>h.map(p=>fromBaseline(p,base)))}));const partFloor={...floor,id:floor.id+'/PART'+(i+1),name:d.name,region:world,holes:[]};return {...d,ctx:context(partFloor,settings,input,false)};});result.splitMode=true;result.connectivity='剔除洞周≤500mm窄条后分开，分别计算';}else result.connectivity='剔除洞周≤500mm窄条后仍连通，按一个面计算';}
 const ctx={parts,input,settings,floor,result,index,base,region,bb,holes,intervals,cache:new Map(),failures:{},feasible:0,axisFeasible:0};
 if(!parts&&holes.length===1&&holes[0].large&&!holes[0].layout.error)ctx.holeSeed=connectedHoleSeed(ctx);
 return ctx;
}
// A connected face reuses the hole perimeter rows rather than adding a second,
// almost coincident grid. Accept this seed only when every Cartesian crossing
// on actual material exists, both direction gaps and every outer margin pass.
function connectedHoleSeed(ctx){
 const nodes=ctx.holes[0].layout.nodes.map(n=>({...n,boundaryException:n.origin==='洞周外围'})),x=[...new Set(nodes.map(n=>n.u))].sort((a,b)=>a-b),y=[...new Set(nodes.map(n=>n.v))].sort((a,b)=>a-b),[a,b,c,d]=ctx.bb,{sx,sy}=ctx.index;
 if(x.some((v,i)=>i&&v-x[i-1]>sx+EPS)||y.some((v,i)=>i&&v-y[i-1]>sy+EPS))return null;
 for(const u of x)for(const v of y)if(regionContains([u,v],ctx.region)&&!nodes.some(n=>Math.abs(n.u-u)<EPS&&Math.abs(n.v-v)<EPS))return null;
 for(const n of nodes){if(!regionContains([n.u,n.v],ctx.region))return null;if(!n.boundaryException&&(n.u-a<500-EPS||c-n.u<500-EPS||n.v-b<500-EPS||d-n.v<500-EPS))return null;}
 const h=[x[0]-a,c-x.at(-1),y[0]-b,d-y.at(-1)];if(h.some((v,i)=>v<0||v>=(i<2?sx:sy)-100-EPS))return null;
 return {nodes,x,y,h};
}
function evaluate(ctx,px,py){
 if(ctx.parts)return evaluateSplit(ctx);
 const cacheKey=px.toFixed(5)+'/'+py.toFixed(5);if(ctx.cache.has(cacheKey))return ctx.cache.get(cacheKey);
 const {sx,sy}=ctx.index,[minX,minY,maxX,maxY]=ctx.bb,seed=ctx.holeSeed,x=seed?{values:seed.x,h1:seed.h[0],h2:seed.h[1]}:axisPositions(minX,maxX,sx,px),y=seed?{values:seed.y,h1:seed.h[2],h2:seed.h[3]}:axisPositions(minY,maxY,sy,py);
 const fail=reason=>{ctx.failures[reason]=(ctx.failures[reason]||0)+1;ctx.cache.set(cacheKey,null);return null;};
 if(!x||!y)return fail('50mm模数下无法同时满足四边端距500≤H<S−100');
 ctx.axisFeasible++;
 const holeChecks=[];
 for(const h of ctx.holes){
  const u=h.local.map(p=>p[0]),v=h.local.map(p=>p[1]),a1=distanceToAxes([Math.min(...u),Math.max(...u)],x.values),a2=distanceToAxes([Math.min(...v),Math.max(...v)],y.values);
  if(!h.large&&h.small&&!(a1>150+EPS||a2>150+EPS))return fail('小洞口A1、A2均未超过150mm');
  if(h.large&&h.layout.error)return fail(h.layout.error);
  holeChecks.push({id:h.id,width:h.width,length:h.length,small:h.small&&!h.large,large:h.large,a1,a2,rule:h.large?'一边≥1000且另一边≥800；外偏80～140，外围/距边超间距补点':h.small?'A1>150 或 A2>150':'支撑中心到洞边≥150',...(h.large?{offsets:h.layout.offsets,outerSize:h.layout.outerSize,perimeterX:h.layout.perimeterX,perimeterY:h.layout.perimeterY,edgeChecks:h.layout.edgeChecks}:{}),passed:true});
 }
 const nodes=[];let omittedInsideHoles=0;
 if(!seed)for(const v of y.values){const intervals=ctx.intervals(v,false);for(const u of x.values){if(!intervals.some(([a,b])=>u>a+EPS&&u<b-EPS))continue;if(ctx.holes.some(h=>ringContains([u,v],h.local))){omittedInsideHoles++;continue;}if(ctx.holes.some(h=>h.large&&u>=h.layout.box[0]-EPS&&u<=h.layout.box[2]+EPS&&v>=h.layout.box[1]-EPS&&v<=h.layout.box[3]+EPS))continue;if(ctx.holes.some(h=>!h.large&&!h.small&&ringDistance([u,v],h.local)<150-EPS))return fail('普通洞口支撑中心净距不足150mm');nodes.push({u,v});}}
 for(const h of ctx.holes.filter(h=>h.large))for(const n of h.layout.nodes){if(!regionContains([n.u,n.v],ctx.region))return fail('洞周补点落入洞口或楼面以外');if(ctx.holes.some(q=>q!==h&&!q.small&&!q.large&&ringDistance([n.u,n.v],q.local)<150-EPS))return fail('洞周补点不满足相邻洞口避让');if(!nodes.some(q=>Math.abs(q.u-n.u)<EPS&&Math.abs(q.v-n.v)<EPS))nodes.push({...n,boundaryException:n.origin==='洞周外围'});}
 if(!nodes.length)return fail('候选交点均不在有效楼面内，未将零点判为通过');
 const rowChecks=[],columnChecks=[];
 for(const v of [...new Set([...y.values,...ctx.holes.filter(h=>h.large).flatMap(h=>h.layout.perimeterY)])])for(const [a,b] of ctx.intervals(v,false)){
  const line=nodes.filter(n=>Math.abs(n.v-v)<EPS&&n.u>=a-EPS&&n.u<=b+EPS).sort((a,b)=>a.u-b.u);const points=line.map(n=>n.u);
  if(!points.length){if(b-a<Math.min(sx,sy)-EPS||ctx.holes.some(h=>h.large&&h.layout.perimeterY.includes(v)))continue;return fail('异形楼面存在无支撑的实际行区段');}const h1=points[0]-a,h2=b-points.at(-1);
  if(!((line[0].boundaryException||h1>=500-EPS)&&(line.at(-1).boundaryException||h2>=500-EPS)&&h1<sx-100-EPS&&h2<sx-100-EPS))return fail('异形边界逐行端距未满足范围');rowChecks.push({at:v,start:a,end:b,h1,h2,startBoundaryException:!!line[0].boundaryException,endBoundaryException:!!line.at(-1).boundaryException});
 }
 for(const u of [...new Set([...x.values,...ctx.holes.filter(h=>h.large).flatMap(h=>h.layout.perimeterX)])])for(const [a,b] of ctx.intervals(u,true)){
  const line=nodes.filter(n=>Math.abs(n.u-u)<EPS&&n.v>=a-EPS&&n.v<=b+EPS).sort((a,b)=>a.v-b.v);const points=line.map(n=>n.v);
  if(!points.length){if(b-a<Math.min(sx,sy)-EPS||ctx.holes.some(h=>h.large&&h.layout.perimeterX.includes(u)))continue;return fail('异形楼面存在无支撑的实际列区段');}const h1=points[0]-a,h2=b-points.at(-1);
  if(!((line[0].boundaryException||h1>=500-EPS)&&(line.at(-1).boundaryException||h2>=500-EPS)&&h1<sy-100-EPS&&h2<sy-100-EPS))return fail('异形边界逐列端距未满足范围');columnChecks.push({at:u,start:a,end:b,h1,h2,startBoundaryException:!!line[0].boundaryException,endBoundaryException:!!line.at(-1).boundaryException});
 }
 const set=new Set(nodes.map(n=>n.u.toFixed(4)+'/'+n.v.toFixed(4))),has=(u,v)=>set.has(u.toFixed(4)+'/'+v.toFixed(4));let cells=0;const segments=[];
 const segmentInside=(a,b)=>{const vertical=Math.abs(a[0]-b[0])<EPS,level=vertical?a[0]:a[1],low=vertical?Math.min(a[1],b[1]):Math.min(a[0],b[0]),high=vertical?Math.max(a[1],b[1]):Math.max(a[0],b[0]);if(!ctx.intervals(level,vertical).some(([x,y])=>low>=x-EPS&&high<=y+EPS))return false;return !ctx.holes.some(h=>rawIntervals(h.local,level,vertical).some(([x,y])=>Math.min(high,y)-Math.max(low,x)>EPS));};
 for(const n of nodes){if(has(n.u+sx,n.v)&&segmentInside([n.u,n.v],[n.u+sx,n.v]))segments.push([[n.u,n.v],[n.u+sx,n.v]]);if(has(n.u,n.v+sy)&&segmentInside([n.u,n.v],[n.u,n.v+sy]))segments.push([[n.u,n.v],[n.u,n.v+sy]]);if(has(n.u+sx,n.v)&&has(n.u,n.v+sy)&&has(n.u+sx,n.v+sy)&&segmentInside([n.u,n.v],[n.u+sx,n.v])&&segmentInside([n.u,n.v],[n.u,n.v+sy])&&segmentInside([n.u+sx,n.v],[n.u+sx,n.v+sy])&&segmentInside([n.u,n.v+sy],[n.u+sx,n.v+sy]))cells++;}
 for(const vertical of [false,true])for(const level of [...new Set(nodes.map(n=>vertical?n.u:n.v))]){const line=nodes.filter(n=>Math.abs((vertical?n.u:n.v)-level)<EPS).sort((a,b)=>(vertical?a.v-b.v:a.u-b.u));for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],gap=vertical?b.v-a.v:b.u-a.u;if(segmentInside([a.u,a.v],[b.u,b.v])){if(gap>(vertical?sy:sx)+EPS)return fail('洞周补点后实际相邻支撑间距仍超过表值');if(a.origin||b.origin)segments.push([[a.u,a.v],[b.u,b.v]]);}}}
 for(const n of nodes){n.world=fromBaseline([n.u,n.v],ctx.base);const members=ctx.floor.members.filter(m=>regionContains(n.world,m.region)).sort((a,b)=>a.bottom-b.bottom);if(!members.length)return fail('交点未对应原生楼面底面');n.sourceFace=members[0].face;n.sourceRegion=members[0].id;n.sourceHeight=members[0].bottom;}
 const value={phase:seed?null:[px,py],connectedHole:!!seed,x:x.values,y:y.values,h:[x.h1,x.h2,y.h1,y.h2],nodes,rowChecks,columnChecks,holeChecks,omittedInsideHoles,cells,gridSegments:segments.map(s=>s.map(p=>fromBaseline(p,ctx.base))),coverage:{x:seed?x.values:coverageAxes(minX,maxX,sx,px),y:seed?y.values:coverageAxes(minY,maxY,sy,py),rule:'井字参考网格覆盖实际轮廓；边界外参考交点不放固顶'},balance:(x.h1-x.h2)**2+(y.h1-y.h2)**2};
 ctx.feasible++;ctx.cache.set(cacheKey,value);return value;
}
function evaluateSplit(ctx){
 if(ctx.splitCalculated)return ctx.splitValue;
 ctx.splitCalculated=true;const fail=reason=>{ctx.failures[reason]=1;ctx.splitValue=null;return null;};
 const nodes=[],splitParts=[],gridSegments=[],rowChecks=[],columnChecks=[];let cells=0,balance=0,tested=0;
 for(const part of ctx.parts){const c=part.ctx;if(c.exempt){splitParts.push({name:part.name,status:'exempt',dimensions:c.result.dimensions,reason:c.result.reasons[0],localRegion:part.region,bounds:regionBounds(part.region),nodes:[],x:[],y:[]});continue;}
  if(c.error)return fail(part.name+'：'+c.result.reasons.join('；'));
  let best=null;for(let px=0;px<c.index.sx;px+=50)for(let py=0;py<c.index.sy;py+=50){tested++;const value=evaluate(c,px,py);if(!value)continue;const score=[value.cells?0:1,value.balance,value.nodes.length,px,py];if(!best||score.some((v,i)=>v<best.score[i]&&score.slice(0,i).every((q,j)=>q===best.score[j])))best={value,score};}
  if(!best)return fail(part.name+'无满足50mm模数、间距和普通点边距≥500的井字覆盖方案');
  const v=best.value;nodes.push(...v.nodes.map(n=>({...n,partName:part.name,origin:'分区普通点'})));gridSegments.push(...v.gridSegments);rowChecks.push(...v.rowChecks.map(c=>({...c,partName:part.name})));columnChecks.push(...v.columnChecks.map(c=>({...c,partName:part.name})));cells+=v.cells;balance+=v.balance;
  splitParts.push({name:part.name,status:'passed',dimensions:c.result.dimensions,localRegion:part.region,bounds:c.bb,phase:v.phase,x:v.x,y:v.y,h:v.h,cells:v.cells,coverage:v.coverage,nodes:v.nodes.map(n=>({u:n.u,v:n.v})),pointCount:v.nodes.length});
 }
 const hole=ctx.holes[0],layout=hole.layout;
 for(const n of layout.nodes.filter(n=>n.origin==='洞周外围'))nodes.push({...n,boundaryException:true});
 const unique=[...new Map(nodes.map(n=>[n.u.toFixed(4)+'/'+n.v.toFixed(4),n])).values()];
 for(const n of unique){if(!regionContains([n.u,n.v],ctx.region))return fail('洞周或分区点落到实际楼面以外');n.world=fromBaseline([n.u,n.v],ctx.base);const member=ctx.floor.members.filter(m=>regionContains(n.world,m.region)).sort((a,b)=>a.bottom-b.bottom)[0];if(!member)return fail('洞周或分区点无原生承托面');n.sourceFace=member.face;n.sourceRegion=member.id;n.sourceHeight=member.bottom;}
 for(const y of [layout.box[1],layout.box[3]])for(let i=1;i<layout.perimeterX.length;i++)gridSegments.push([[layout.perimeterX[i-1],y],[layout.perimeterX[i],y]].map(p=>fromBaseline(p,ctx.base)));
 for(const x of [layout.box[0],layout.box[2]])for(let i=1;i<layout.perimeterY.length;i++)gridSegments.push([[x,layout.perimeterY[i-1]],[x,layout.perimeterY[i]]].map(p=>fromBaseline(p,ctx.base)));
 ctx.feasible=1;ctx.axisFeasible=1;ctx.splitValue={splitParts,partitionGuides:ctx.parts.map(p=>({axis:p.axis,value:p.value})),splitTested:tested,phase:null,x:[...new Set(unique.map(n=>n.u))].sort((a,b)=>a-b),y:[...new Set(unique.map(n=>n.v))].sort((a,b)=>a-b),h:null,nodes:unique,rowChecks,columnChecks,cells,balance,gridSegments,holeChecks:[{id:hole.id,width:hole.width,length:hole.length,large:true,small:false,offsets:layout.offsets,outerSize:layout.outerSize,perimeterX:layout.perimeterX,perimeterY:layout.perimeterY,boundaryException:true,passed:true}],omittedInsideHoles:0,notes:['洞周点先算，允许距楼面外边不足500mm；两侧作为独立楼面分别排布，普通点边距≥500mm。']};return ctx.splitValue;
}
function alignedCommon(a,av,b,bv){
 const ah=new Set(av.nodes.map(n=>n.world.map(v=>v.toFixed(3)).join('/'))),bh=new Set(bv.nodes.map(n=>n.world.map(v=>v.toFixed(3)).join('/')));
 for(const n of av.nodes)if(regionContains(n.world,b.floor.region)&&!bh.has(n.world.map(v=>v.toFixed(3)).join('/')))return false;
 for(const n of bv.nodes)if(regionContains(n.world,a.floor.region)&&!ah.has(n.world.map(v=>v.toFixed(3)).join('/')))return false;return true;
}
// Reuse the exact floor validator for rack alignment. Table spacing, holes,
// actual-row/column margins, source faces and paired-model alignment all stay
// authoritative. The rack planner cannot invent extra floor supports.
export function floorAlignmentOptions(input,settings,original,wantedIds){
 const byId=new Map(original.floors.map(f=>[f.id,f])),contexts=new Map();
 const ctx=id=>{if(!contexts.has(id))contexts.set(id,context(input.floors.find(f=>f.id===id),settings,input));return contexts.get(id);};
 const result=[];
 for(const group of input.overlapGroups){
  if(!group.floors.some(id=>wantedIds.has(id)))continue;
  const cs=group.floors.map(ctx).filter(c=>!c.exempt);if(!cs.length||cs.some(c=>c.error||byId.get(c.floor.id)?.status!=='passed'))continue;
  const canonical=cs[0],{sx,sy}=canonical.index;
  if(cs.some(c=>c.index.sx!==sx||c.index.sy!==sy||Math.abs(normalizeAngle(c.base.angleDeg-canonical.base.angleDeg))>EPS))continue;
  for(const c of cs)c.delta=toBaseline(c.base.origin,canonical.base);
  if(cs.some(c=>c.delta.some(v=>Math.abs(v/50-Math.round(v/50))>1e-6)))continue;
  const options=[],seen=new Set();
  for(let x=0;x<sx;x+=50)for(let y=0;y<sy;y+=50){
   const values=cs.map(c=>evaluate(c,mod(x-c.delta[0],sx),mod(y-c.delta[1],sy)));
   if(values.some((v,i)=>!v||v.nodes.length>byId.get(cs[i].floor.id).nodes.length||(byId.get(cs[i].floor.id).cells>0&&!v.cells)))continue;
   if(group.pairs.filter(p=>cs.some(c=>c.floor.id===p.a)&&cs.some(c=>c.floor.id===p.b)).some(p=>!alignedCommon(ctx(p.a),values[cs.findIndex(c=>c.floor.id===p.a)],ctx(p.b),values[cs.findIndex(c=>c.floor.id===p.b)])))continue;
   const signature=values.map(v=>v.nodes.map(n=>n.world.map(a=>a.toFixed(3)).join('/')).sort().join('|')).join(';');if(seen.has(signature))continue;seen.add(signature);
   options.push({phase:[x,y],floors:cs.map((c,i)=>({id:c.floor.id,value:values[i]})),pointCount:values.reduce((s,v)=>s+v.nodes.length,0)});
  }
  result.push({id:group.id||group.floors.join('|'),floorIds:cs.map(c=>c.floor.id),options});
 }
 return result;
}
export function calculateFloors(input,settings,progress=()=>{}){
 const contexts=new Map(input.floors.map(f=>[f.id,context(f,settings,input)]));let done=0;
 for(const group of input.overlapGroups){
  const cs=group.floors.map(id=>contexts.get(id)).filter(c=>!c.exempt),valid=cs.filter(c=>!c.error);if(!cs.length){done++;progress(done,input.overlapGroups.length);continue;}
  if(valid.length!==cs.length){for(const c of cs)if(!c.error)c.result.reasons.push('同位组中有楼面缺少有效基准或索引，整组待处理');done++;progress(done,input.overlapGroups.length);continue;}
  const canonical=cs[0],{sx,sy}=canonical.index;let issue='';
  for(const c of cs){
   if(c.index.sx!==sx||c.index.sy!==sy)issue='重合楼面索引间距不同；固定表值与上下同位无法自动兼容';
   if(Math.abs(normalizeAngle(c.base.angleDeg-canonical.base.angleDeg))>EPS)issue='重合楼面基准方向不一致，请先统一';
   c.delta=toBaseline(c.base.origin,canonical.base);
   if(c.delta.some(v=>Math.abs(v/50-Math.round(v/50))>1e-6))issue='重合楼面基准点不在同一50mm模数上，请先统一';
  }
  if(issue){for(const c of cs)c.result.reasons.push(issue);done++;progress(done,input.overlapGroups.length);continue;}
  let best=null,attempted=0,commonRejected=0;
  for(let x=0;x<sx;x+=50)for(let y=0;y<sy;y+=50){attempted++;const values=cs.map(c=>evaluate(c,mod(x-c.delta[0],sx),mod(y-c.delta[1],sy)));if(values.some(v=>!v))continue;
   if(group.pairs.filter(p=>!contexts.get(p.a).exempt&&!contexts.get(p.b).exempt).some(p=>!alignedCommon(contexts.get(p.a),values[cs.findIndex(c=>c.floor.id===p.a)],contexts.get(p.b),values[cs.findIndex(c=>c.floor.id===p.b)]))){commonRejected++;continue;}
   const penalty=values.filter(v=>v.cells===0).length,balance=values.reduce((s,v)=>s+v.balance,0),count=values.reduce((s,v)=>s+v.nodes.length,0);const score=[penalty,balance,count,x,y];
   if(!best||score.some((v,i)=>v<best.score[i]&&score.slice(0,i).every((q,j)=>q===best.score[j])))best={score,values,phase:[x,y]};
  }
  for(let i=0;i<cs.length;i++){
   const c=cs[i],r=c.result;r.tested=attempted;r.individuallyFeasible=c.feasible;r.axisLegalPhases=c.axisFeasible;r.commonRejected=commonRejected;r.localFailureCounts=c.failures;
   if(best){const v=best.values[i];Object.assign(r,v,{status:'passed',layout:v.splitParts?'洞周先算 · 分面独立覆盖':v.connectedHole?'连通单面 · 洞周轴线延展':v.cells?'井字网格':v.x.length===1||v.y.length===1?'单排／单列':'裁剪网格',commonPhase:best.phase,alignmentChecked:true,endDistances:v.h?{H1:v.h[0],H2:v.h[1],H3:v.h[3],H4:v.h[2]}:null});if(v.splitParts){r.tested=v.splitTested;r.commonPhase=null;}if(v.connectedHole)r.commonPhase=null;r.nodes=r.nodes.map((n,j)=>({...n,id:r.id+'-P'+String(j+1).padStart(3,'0')}));if(v.connectedHole)r.notes=['洞口轴线在同一连通面内延展；实际相邻间距逐段不超过Sx/Sy，洞周点可例外不足500mm，普通点仍≥500mm。'];else if(!v.cells&&!v.splitParts)r.notes=['净跨仅能容纳单排或裁剪网格；保留固定间距、端距和避洞条件，未强行补四点。'];}
   else if(c.feasible)r.reasons.push('本层有独立候选，但四层同位组无共同可行相位');
   else r.reasons.push(...Object.entries(c.failures).filter(([reason])=>!c.axisFeasible||!reason.startsWith('50mm')).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]));
  }
  done++;progress(done,input.overlapGroups.length);
 }
 const floors=[...contexts.values()].map(c=>c.result);return {version:2,storyHeight:input.storyHeight,baselineRevision:settings.revision,indexSource:input.source,rules:input.rules,floors,summary:{floors:floors.length,passed:floors.filter(r=>r.status==='passed').length,exempt:floors.filter(r=>r.status==='exempt').length,pending:floors.filter(r=>r.status==='pending').length,uniqueModelPoints:floors.reduce((s,r)=>s+r.nodes.length,0)}};
}
