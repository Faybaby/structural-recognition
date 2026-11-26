import {matchBeamPattern} from './support-rule-matching.js';
import {beamLookup} from './beam-core.js';
import {withBeamSlabThickness} from './slab-thickness.js';
import {layoutOrdinarySpan,layoutOrdinaryArc} from './ordinary-span.js';
import {regionContains} from './floor-core.js';
import {layoutStairBeam,deduplicateJunctions} from './cad-return-rules.js';
const EPS=1e-5,TAU=Math.PI*2,dot=(a,b)=>a[0]*b[0]+a[1]*b[1],cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>a.map((v,i)=>v-b[i]);
export function beamPoint(path,t){
 if(path.type==='chain'){for(let i=0;i<path.parts.length;i++){const p=path.parts[i];if(t<=p.length||i===path.parts.length-1)return beamPoint(p,t);t-=p.length;}}
 if(path.type==='line')return path.start.map((v,i)=>v+t*(path.end[i]-v)/path.length);
 const a=path.angle+t/path.length*path.sweep;return [path.center[0]+path.radius*Math.cos(a),path.center[1]+path.radius*Math.sin(a)];
}
function tangent(p,t=0){if(p.type==='chain'){for(let i=0;i<p.parts.length;i++){const q=p.parts[i];if(t<=q.length||i===p.parts.length-1)return tangent(q,t);t-=q.length;}}if(p.type==='line')return sub(p.end,p.start).map(v=>v/p.length);const sign=Math.sign(p.sweep),a=p.angle+t/p.length*p.sweep;return [-Math.sin(a)*sign,Math.cos(a)*sign];}
function station(p,q){if(p.type==='line')return dot(sub(q,p.start),tangent(p));let a=(Math.atan2(q[1]-p.center[1],q[0]-p.center[0])-p.angle)*Math.sign(p.sweep);while(a< -EPS)a+=TAU;while(a>TAU+EPS)a-=TAU;return a*p.radius;}
export function beamSourceAt(beam,point){const sources=(beam.nativeSources||[beam]).filter(s=>regionContains(point,s.region));return sources.sort((a,b)=>a.bottom-b.bottom)[0]||null;}
function extended(b,t,other){const allowance=b.path.type==='line'?other.gw/2+.05:.05;return t>=-allowance&&t<=b.length+allowance;}
export function beamIntersections(a,b){
 if(a.path.type==='chain'||b.path.type==='chain'){
  const aa=a.path.type==='chain'?a.path.parts:[a.path],bb=b.path.type==='chain'?b.path.parts:[b.path],hits=[];let offA=0;
  for(let i=0;i<aa.length;i++){let offB=0;for(let j=0;j<bb.length;j++){
   for(const h of beamIntersections({...a,path:aa[i],length:aa[i].length},{...b,path:bb[j],length:bb[j].length})){
    if((i>0&&h.ta< -EPS)||(i<aa.length-1&&h.ta>aa[i].length+EPS)||(j>0&&h.tb< -EPS)||(j<bb.length-1&&h.tb>bb[j].length+EPS))continue;
    if(!hits.some(v=>Math.hypot(...sub(v.point,h.point))<.05))hits.push({...h,ta:h.ta+offA,tb:h.tb+offB});
   }offB+=bb[j].length;
  }offA+=aa[i].length;}return hits;
 }
 const p=a.path,q=b.path,points=[];
 if(p.type==='line'&&q.type==='line'){
  const u=tangent(p),v=tangent(q),den=cross(u,v);if(Math.abs(den)<1e-6)return [];
  const t=cross(sub(q.start,p.start),v)/den;points.push(beamPoint(p,t));
 }else if(p.type==='arc'&&q.type==='arc'){
  const v=sub(q.center,p.center),d=Math.hypot(...v);if(d<EPS||d>p.radius+q.radius+EPS||d<Math.abs(p.radius-q.radius)-EPS)return [];
  const x=(p.radius*p.radius-q.radius*q.radius+d*d)/(2*d),h=Math.sqrt(Math.max(0,p.radius*p.radius-x*x));
  for(const sign of [1,-1])points.push([p.center[0]+v[0]*x/d-sign*v[1]*h/d,p.center[1]+v[1]*x/d+sign*v[0]*h/d]);
 }else{
  const line=p.type==='line'?p:q,arc=p.type==='arc'?p:q,u=tangent(line),v=sub(line.start,arc.center),B=2*dot(v,u),C=dot(v,v)-arc.radius*arc.radius,D=B*B-4*C;if(D< -EPS)return [];
  for(const sign of [-1,1])points.push(beamPoint(line,(-B+sign*Math.sqrt(Math.max(0,D)))/2));
 }
 const unique=[];for(const point of points){const ta=station(p,point),tb=station(q,point);if(extended(a,ta,b)&&extended(b,tb,a)&&!unique.some(x=>Math.hypot(...sub(x.point,point))<.05))unique.push({point,ta,tb});}return unique;
}
const onMod=v=>Math.abs(v/50-Math.round(v/50))<1e-6;
export function calculateOrdinaryBeams(input,settings){
 const groupMap=new Map((input.groups||[]).map(g=>[g.id,g]));
 const base=settings.global,beams=input.beams.map(source=>{const b=withBeamSlabThickness(source);return {...b,region:b.region||groupMap.get(b.groupId)?.region,nativeSources:input.sources?.filter(s=>s.groupId===b.groupId),nodes:[],segments:[],junctions:[],status:'pending',reasons:[...b.issues],baselineRevision:settings.revision};}),junctions=[],registry=new Map();
 if(!base)return {beams,junctions,summary:{beams:beams.length,passed:0,pending:beams.length,uniqueModelPoints:0},positionsOnly:true};
 const groups=Object.groupBy?Object.groupBy(beams,b=>b.key):beams.reduce((g,b)=>((g[b.key]??=[]).push(b),g),{});
 for(const b of beams){
  b.index=beamLookup(input,b);if(!b.index)b.reasons.push('梁宽×梁高／板厚向上取档仍缺项');
  b.base=base;b.baselineScope='global';
  if(b.path.type==='line'){
   const u=tangent(b.path),angle=Math.atan2(u[1],u[0])*180/Math.PI;
   const delta=Math.abs(((angle-(base.angleDeg||0))%90+90)%90),diagonal=Math.min(delta,90-delta)>.05;
   const local=settings.ordinaryBaselines?.[b.id]||settings.ordinaryBaselines?.[b.matchParent]||b.reviewBaseline;
   if(diagonal){
    const valid=local?.confirmed&&Array.isArray(local.origin)&&local.origin.length===2&&local.origin.every(Number.isFinite)&&Number.isFinite(local.angleDeg)&&Math.abs(Math.sin((angle-local.angleDeg)*Math.PI/180))<1e-5;
    b.requiresLocalBaseline=true;
    if(valid){b.base=local;b.baselineScope='route';}else b.reasons.push('斜梁已按三维平行边识别；请在右侧确认本段独立基准，未生成正式点位');
   }
  }
  b.originProjection=dot(sub(b.start,b.base.origin),tangent(b.path));
 }
 const pointOwners=(key,p)=>(input.sources||groups[key]).filter(b=>b.key===key&&regionContains(p,b.region)).sort((a,b)=>a.bottom-b.bottom||a.id.localeCompare(b.id));
 // A junction is resolved geometrically before any intermediate-span layout.
 const geometryAxes=[...beams,...[...(input.junctionGuides||[]),...(input.glJunctionGuides||[])].map(g=>({...g,nativeSources:g.junctionOnly?[g]:input.sources?.filter(s=>s.groupId===g.groupId),junctions:[],originProjection:dot(sub(g.start,base.origin),tangent(g.path))}))];
 for(let i=0;i<geometryAxes.length;i++)for(let k=i+1;k<geometryAxes.length;k++){
  const a=geometryAxes[i],b=geometryAxes[k];if(a.key!==b.key||a.referenceOnly&&b.referenceOnly||a.junctionOnly&&b.junctionOnly||a.stairBeam||b.stairBeam)continue;
  if((a.sameHeightOnly||b.sameHeightOnly)&&Math.abs(a.bottom-b.bottom)>.05)continue;
  for(const hit of beamIntersections(a,b)){
   // A tangent split is a calculation boundary, not a new physical beam junction.
   if(a.groupId===b.groupId&&(a.curveSegment||b.curveSegment)&&Math.abs(dot(tangent(a.path,hit.ta),tangent(b.path,hit.tb)))>.99999&&[a.start,a.end].some(p=>Math.hypot(...sub(p,hit.point))<(a.path.type==='arc'?.05:a.gw/2+.05))&&[b.start,b.end].some(p=>Math.hypot(...sub(p,hit.point))<(b.path.type==='arc'?.05:b.gw/2+.05)))continue;
   const sa=beamSourceAt(a,hit.point),sb=beamSourceAt(b,hit.point);if(!sa&&!sb)continue;const targetBottom=Math.min(sa?.bottom??Infinity,sb?.bottom??Infinity),owners=pointOwners(a.key,hit.point).filter(q=>Math.abs(q.bottom-targetBottom)<.05);if(!owners.length)continue;
   const diff=Math.abs(a.height-b.height),eligible=diff<100-EPS;
   const id=a.key+'/J'+String(junctions.filter(j=>j.key===a.key).length+1).padStart(3,'0');
   // True junctions may be off the 50mm grid. Preserve their geometry and flag
   // this explicit exception; span/end points still use their confirmed modulus.
   const exemptParticipants=[a,b].filter(q=>q.referenceOnly||q.calculationExempt||q.calculationPart?.exempt).map(q=>q.id);
   const modulusAxes=[a,b].map((beam,k)=>{const coordinate=[hit.ta,hit.tb][k]+beam.originProjection,nearest=Math.round(coordinate/50)*50;return {beamId:beam.id,baselineScope:beam.baselineScope||'global',coordinate,nearestGridCoordinate:nearest,deviation:coordinate-nearest,onGrid:onMod(coordinate)};});
   const legal=modulusAxes.every(axis=>axis.onGrid),status=exemptParticipants.length||!eligible?'excluded':'placed',modulusException=status==='placed'&&!legal?'真实梁梁交点优先，允许50mm模数例外':null;
   const j={id,key:a.key,beamIds:[a.id,b.id],point:hit.point,heightDifference:diff,status,exemptParticipants,exclusionType:exemptParticipants.length?'exempt-region':!eligible?'height-difference':null,modulusException,modulusReview:{step:50,axes:modulusAxes,maxDeviation:Math.max(...modulusAxes.map(axis=>Math.abs(axis.deviation)))},reason:exemptParticipants.length?'与免放区域相交，取消交点支撑，不作为GTT分段锚点':!eligible?'梁高差≥100mm，不放交点支撑':modulusException?'交点50mm模数例外：在真实交点放支撑，不移动交点；其他补点仍按50mm模数':'梁高差＜100mm，真实中心线交点',owner:owners[0].id,sourceHeight:owners[0].bottom,stations:[hit.ta,hit.tb]};
   junctions.push(j);a.junctions.push({...j,t:hit.ta});b.junctions.push({...j,t:hit.tb});
  }
 }
 deduplicateJunctions(junctions,geometryAxes,station,tangent);
 for(const j of junctions.filter(j=>j.status==='placed')){
  const axes=j.beamIds.map((id,k)=>{const b=geometryAxes.find(q=>q.id===id),coordinate=j.stations[k]+b.originProjection,nearest=Math.round(coordinate/50)*50;return {beamId:id,baselineScope:b.baselineScope||'global',coordinate,nearestGridCoordinate:nearest,deviation:coordinate-nearest,onGrid:onMod(coordinate)};});
  j.modulusReview={step:50,axes,maxDeviation:Math.max(...axes.map(a=>Math.abs(a.deviation)))};j.modulusException=axes.every(a=>a.onGrid)?null:'真实梁梁交点优先，允许50mm模数例外';
 }
 for(const b of geometryAxes)b.junctions=b.junctions.map(old=>({...old,...junctions.find(j=>j.id===old.id),t:old.t}));
 function addNode(beam,t,origin,extra={}){
  const world=extra.worldOverride||beamPoint(beam.path,t),wanted=extra.sourceHeight??beamSourceAt(beam,world)?.bottom,owners=pointOwners(beam.key,world).filter(b=>Math.abs(b.bottom-wanted)<.05);if(!owners.length)return null;
  // Select the actual lower bottom face, not an inferred level, at every point.
   const owner=owners.find(b=>b.sourceFace===beam.sourceFace)||owners[0],key=beam.key+'/'+world.map(v=>v.toFixed(3)).join('/')+'/'+owner.bottom;
  let n=registry.get(key);if(!n){n={id:beam.key+'/OP'+String([...registry.values()].filter(n=>n.key===beam.key).length+1).padStart(4,'0'),key:beam.key,world,sourceHeight:owner.bottom,sourceFace:owner.sourceFace,sourceRegion:input.sources?owner.id:owner.memberIds[0],ownerBeam:beam.id,origin,axisCoordinate:t+beam.originProjection,t,beamIds:[],...extra};registry.set(key,n);}
  if(origin==='梁梁交点')n.origin=origin;
  if(extra.junctionModulusException){n.modulusException=extra.modulusException;n.junctionModulusException=true;n.modulusReview=extra.modulusReview;}
  if(!n.beamIds.includes(beam.id))n.beamIds.push(beam.id);return n;
 }
 // Excluded high-difference/exempt junctions do not split spans. Grid exceptions
 // at true junctions are accepted; unrelated missing evidence still blocks a route.
 for(const b of beams){
  b.matchedRule=matchBeamPattern(b,{junctions:b.junctions});
  b.calculationPipeline=b.stairRecognition?['楼梯空间关系','真实梁面连续性','完整中心线','保留原生阴阳端','查表','整梁居中及端距1300复核','正式点位','当前模型承接']:['三维分割','阴阳边核验','既有情况匹配','免放判定','查表','交点/GTT','正式点位','当前模型承接'];
  if(b.calculationExempt){b.status='passed';b.reasons=[];b.mode=b.exemptionReason;continue;}
  if(b.reasons.length){
   if(b.index&&['line','arc'].includes(b.path.type)){
    const basic=b.path.type==='arc'?layoutOrdinaryArc({length:b.length,spacing:b.index.spacing,neighborOffsets:b.curveNeighborOffsets}):layoutOrdinarySpan({length:b.length,gw:b.gw,ends:b.ends,spacing:b.index.spacing,originProjection:b.originProjection});
    const start=basic.anchors?.[0]??0,end=basic.anchors?.[1]??b.length;
    const anchors=[{t:start,type:b.ends[0].type==='yang'?'阳端位置':'阴线'},...b.junctions.filter(j=>['placed','pending'].includes(j.status)&&j.t>=start-.05&&j.t<=end+.05).map(j=>({t:j.t,type:j.modulusException?'真实交点（模数例外）':'真实交点'})),{t:end,type:b.ends[1].type==='yang'?'阳端位置':'阴线'}].sort((a,c)=>a.t-c.t);
    const clean=anchors.filter((a,i)=>!i||Math.abs(a.t-anchors[i-1].t)>.05);
    b.candidateSegments=clean.slice(1).map((right,i)=>{const left=clean[i];const span=b.path.type==='arc'?layoutOrdinaryArc({length:right.t-left.t,spacing:b.index.spacing}):layoutOrdinarySpan({length:right.t-left.t,gw:b.gw,ends:[{type:'yin'},{type:'yin'}],spacing:b.index.spacing,originProjection:b.originProjection+left.t});return {...span,id:b.id+'/REVIEW'+(i+1),left:left.t,right:right.t,gtt:right.t-left.t,leftType:left.type,rightType:right.type,reviewOnly:true,formalPoints:false,nodes:[]};});
   }
   continue;
  }
  if(b.stairBeam){
   const span=layoutStairBeam({length:b.length,originProjection:b.originProjection});
   if(span.status!=='passed'||span.nodes.some(n=>!beamSourceAt(b,beamPoint(b.path,n.t)))){b.reasons.push(...span.reasons,'楼梯梁候选点须落在实际三维梁面');continue;}
   b.status='passed';b.endOffsets=span.endOffsets;b.mode=span.mode;b.segments=[{id:b.id+'/S1',left:0,right:b.length,leftType:'楼梯整梁阴端',rightType:'楼梯整梁阴端',...span}];
   for(const n of span.nodes){const node=addNode(b,n.t,n.origin);if(node)b.nodes.push({...node,t:n.t,axisCoordinate:n.t+b.originProjection});}continue;
  }
  if(b.curveSegment&&!b.junctions.some(j=>j.status==='placed')){
   const offsets=[...(b.curveNeighborOffsets||[0,0])],neighborReview=[];
   for(let side=0;side<2;side++){
    const at=side?b.end:b.start,adj=beams.find(q=>q.id!==b.id&&q.groupId===b.groupId&&q.path.type==='line'&&[q.start,q.end].some(p=>Math.hypot(...sub(p,at))<.05));
    if(!adj)continue;
    const end=Math.hypot(...sub(adj.start,at))<.05?0:1;
    const endSpan=adj.index&&layoutOrdinarySpan({length:adj.length,gw:adj.gw,ends:adj.ends,spacing:adj.index.spacing,originProjection:adj.originProjection});
    if(endSpan?.status==='passed'&&endSpan.endOffsets[end]!=null)offsets[side]=endSpan.endOffsets[end];
    else neighborReview.push(adj.id+'：邻段端部位置尚待确认');
    if(adj.reasons.length)neighborReview.push(adj.id+'：邻段仍有待核对项');
   }
   const span=layoutOrdinaryArc({length:b.length,spacing:b.index.spacing,neighborOffsets:offsets});
   span.neighborReview=[...new Set(neighborReview)];
   if(span.status!=='passed'){b.reasons.push(...span.reasons);continue;}
   if(span.nodes.some(n=>!beamSourceAt(b,beamPoint(b.path,n.t)))){b.reasons.push('圆弧等分位置未落入实际原生梁面');continue;}
   b.status='passed';b.endOffsets=[null,null];b.mode=span.mode;b.segments=[{id:b.id+'/S1',left:0,right:b.length,leftType:'圆弧边界',rightType:'圆弧边界',...span}];
   for(const p of span.nodes){const node=addNode(b,p.t,p.origin,{modulusException:p.modulusException});if(node)b.nodes.push({...node,t:p.t,axisCoordinate:p.t+b.originProjection});}continue;
  }
  if(b.closed&&!b.junctions.some(j=>j.status==='placed')){
   const count=Math.max(1,Math.ceil(b.length/b.index.spacing)),remainder=b.length-(count-1)*b.index.spacing,choices=[];
   for(let k=Math.ceil((b.originProjection-EPS)/50);k<=Math.floor((remainder+b.originProjection+EPS)/50);k++)choices.push(k*50-b.originProjection);
   choices.sort((a,c)=>Math.abs(a-remainder/2)-Math.abs(c-remainder/2));if(!choices.length){b.reasons.push('闭环没有可用50mm模数相位');continue;}
   const values=Array.from({length:count},(_,i)=>choices[0]+i*b.index.spacing);
   if(values.some(t=>!beamSourceAt(b,beamPoint(b.path,t)))){b.reasons.push('闭环候选点不在真实原生面上');continue;}
   b.status='passed';b.endOffsets=[null,null];b.mode='闭环连续弧长布点，收口间距不超过XX';b.segments=[{id:b.id+'/S1',left:0,right:b.length,gtt:b.length,leftType:'闭环',rightType:'闭环',status:'passed',mode:b.mode,closed:true,spacing:b.index.spacing,closingGap:remainder,actualGaps:values.slice(1).map((t,i)=>t-values[i])}];
   for(const t of values){const n=addNode(b,t,'普通梁闭环布点');if(n)b.nodes.push({...n,t,axisCoordinate:t+b.originProjection});}continue;
  }
  const placed=b.junctions.filter(j=>j.status==='placed'),suppressed=[],contactEnds=[];
  // A real joint replaces the free-end support at that same contact. The
  // physical yang label itself remains unchanged for review.
  for(let end=0;end<2;end++){
   const near=placed.filter(j=>{const other=j.beamIds.filter(id=>id!==b.id).map(id=>geometryAxes.find(q=>q.id===id));return Math.abs(j.t-(end?b.length:0))<=Math.max(...other.map(q=>(q?.gw||0)/2))+.05;}).sort((a,c)=>Math.abs(a.t-(end?b.length:0))-Math.abs(c.t-(end?b.length:0)));
   if(near.length){contactEnds.push({end,junction:near[0].id,t:near[0].t});if(b.ends[end].type==='yang')suppressed.push({end,junction:near[0].id,t:near[0].t,reason:'真实交点已放置，取消同一接头的阳线端部点；原阳线标注保留'});}
  }
  b.suppressedYangEndpoints=suppressed;
  b.jointEndAnchors=contactEnds;
  const lo=contactEnds.find(s=>s.end===0)?.t??0,hi=contactEnds.find(s=>s.end===1)?.t??b.length,layoutEnds=b.ends.map((e,i)=>contactEnds.some(s=>s.end===i)?{...e,type:'yin'}:e);
  const endpointLayout=hi-lo<=EPS?{status:'passed',nodes:[],reasons:[],anchors:[0,0],endOffsets:[null,null]}:layoutOrdinarySpan({length:hi-lo,gw:b.gw,ends:layoutEnds,spacing:b.index.spacing,originProjection:b.originProjection+lo});
  if(endpointLayout.anchors)endpointLayout.anchors=endpointLayout.anchors.map(t=>t+lo);endpointLayout.nodes=endpointLayout.nodes.map(n=>({...n,t:n.t+lo}));
  if(endpointLayout.status!=='passed'){b.reasons.push(...endpointLayout.reasons);continue;}
  const anchors=[{t:endpointLayout.anchors[0],type:suppressed.some(s=>s.end===0)?'交点':b.ends[0].type==='yang'?'阳线':'阴线'},{t:endpointLayout.anchors[1],type:suppressed.some(s=>s.end===1)?'交点':b.ends[1].type==='yang'?'阳线':'阴线'},...placed.map(j=>({t:j.t,type:'交点',junction:j.id}))].sort((a,b)=>a.t-b.t);
  const clean=[];for(const x of anchors)if(!clean.length||Math.abs(x.t-clean.at(-1).t)>.05)clean.push(x);else if(x.type==='交点')clean[clean.length-1]=x;
  const staged=[];for(const n of endpointLayout.nodes.filter(n=>n.origin==='阳线端部'))staged.push({...n});
  for(const j of placed)staged.push({t:j.t,worldOverride:j.point,origin:'梁梁交点',junction:j.id,sourceHeight:j.sourceHeight,...(j.modulusException?{modulusException:j.modulusException,junctionModulusException:true,modulusReview:j.modulusReview}:{})});
  for(let i=1;i<clean.length;i++){
   const left=clean[i-1],right=clean[i],gtt=right.t-left.t;if(gtt<=EPS)continue;
   const span=layoutOrdinarySpan({length:gtt,gw:b.gw,ends:[{type:'yin'},{type:'yin'}],spacing:b.index.spacing,originProjection:b.originProjection+left.t});
   b.segments.push({id:b.id+'/S'+i,left:left.t,right:right.t,gtt,leftType:left.type,rightType:right.type,...span});
   if(span.status!=='passed'){b.reasons.push(...span.reasons);break;}
   for(const n of span.nodes)staged.push({...n,t:n.t+left.t,origin:n.origin==='居中补点'?'普通梁居中补点':'普通梁长段补点',segment:i});
  }
  if(b.reasons.length)continue;
  // Ensure every selected point is on actual classified beam material, never on a void or GL-only footprint.
  if(staged.some(n=>!pointOwners(b.key,n.worldOverride||beamPoint(b.path,n.t)).some(q=>Math.abs(q.bottom-(n.sourceHeight??beamSourceAt(b,beamPoint(b.path,n.t))?.bottom))<.05))){b.reasons.push('候选点未落入普通梁实际底面，未跨空放点');continue;}
  b.status='passed';b.endOffsets=endpointLayout.endOffsets;b.mode=b.segments.map(s=>s.mode).filter((v,i,a)=>a.indexOf(v)===i).join('；');
  for(const n of staged){const node=addNode(b,n.t,n.origin,{...(n.worldOverride?{worldOverride:n.worldOverride}:{}),gll:n.gll??null,junction:n.junction??null,sourceHeight:n.sourceHeight??beamSourceAt(b,beamPoint(b.path,n.t))?.bottom,...(n.junctionModulusException?{modulusException:n.modulusException,junctionModulusException:true,modulusReview:n.modulusReview}:{})});if(node&&!b.nodes.some(q=>q.id===node.id))b.nodes.push({...node,origin:n.origin,gll:n.gll??null,junction:n.junction??null,t:n.t,axisCoordinate:n.t+b.originProjection});}
 }
 // A shared point discovered on a later route must carry the same exception on
 // every earlier reference, without replacing each route's own station value.
 for(const b of beams)b.nodes=b.nodes.map(n=>{const shared=[...registry.values()].find(q=>q.id===n.id);return shared?.junctionModulusException?{...n,origin:shared.origin,modulusException:shared.modulusException,junctionModulusException:true,modulusReview:shared.modulusReview}:n;});
 // Shared junctions are exported exactly once. References remain on every calculated beam.
 let points=[...registry.values()];const nodeOwners=new Map();
 for(const n of points){const owner=beams.find(b=>b.id===n.ownerBeam&&b.status==='passed'&&b.nodes.some(q=>q.id===n.id))||beams.find(b=>b.status==='passed'&&b.nodes.some(q=>q.id===n.id));nodeOwners.set(n.id,owner?.id);}
 const landingFloors=beams.filter(b=>b.status==='passed').map(b=>({...b,nodes:b.nodes.filter(n=>nodeOwners.get(n.id)===b.id)}));
 points=landingFloors.flatMap(b=>b.nodes);
 for(const j of junctions)if(j.status==='placed'&&!points.some(n=>n.key===j.key&&Math.hypot(...sub(n.world,j.point))<.05)){j.status='pending';j.reason=(j.modulusException?'交点允许50mm模数例外':'交点符合高差和模数')+'，但关联梁段尚有其他待处理项，未生成正式点位';}
 for(const b of beams)b.junctions=b.junctions.map(j=>({...j,...junctions.find(q=>q.id===j.id),t:j.t}));
 const pendingCoverage=input.coverage.filter(c=>c.status==='pending');
 const beamGroups=(input.groups||[]).map(g=>{const routes=beams.filter(b=>b.groupId===g.id),groupPoints=points.filter(n=>n.beamIds.some(id=>g.routes.includes(id))),passed=routes.filter(r=>r.status==='passed').length,exempt=routes.length?routes.every(r=>r.calculationExempt):g.calculationParts?.length&&g.calculationParts.every(c=>c.exempt);return {...g,routeResults:routes.map(r=>r.id),pointIds:groupPoints.map(n=>n.id),status:exempt?'exempt':!routes.length?'pending':passed===routes.length&&!g.pendingParts?.length?'passed':passed?'partial':'pending',passedRoutes:passed,pendingRoutes:routes.length-passed};});
 return {version:2,baselineRevision:settings.revision,source:input.source,rules:{...input.rules,junctionModulus:"真实交点可作50mm模数例外，位置不移动，逐点特殊标注；普通补点仍按50mm模数"},storyHeight:input.storyHeight,beams,beamGroups,junctions,points,landingFloors,coverage:input.coverage,rebateEvidence:input.rebateEvidence,caseMatchAudit:input.caseMatchAudit,stairRecognition:input.stairRecognition,cadReview20261118:input.cadReview20261118,positionsOnly:true,componentSelection:'deferred',summary:{beams:beams.length,beamGroups:beamGroups.length,exemptGroups:beamGroups.filter(g=>g.status==='exempt').length,exemptParts:(input.groups||[]).flatMap(g=>g.calculationParts||[]).filter(c=>c.exempt).length,passedGroups:beamGroups.filter(g=>g.status==='passed').length,partialGroups:beamGroups.filter(g=>g.status==='partial').length,pendingGroups:beamGroups.filter(g=>g.status==='pending').length,passed:beams.filter(b=>b.status==='passed').length,pending:beams.filter(b=>b.status!=='passed').length,zero:beams.filter(b=>b.status==='passed'&&!b.nodes.length).length,uniqueModelPoints:points.length,junctionPoints:points.filter(n=>n.origin==='梁梁交点').length,junctionModulusExceptionPoints:points.filter(n=>n.junctionModulusException).length,pendingJunctions:junctions.filter(j=>j.status==='pending').length,excludedJunctions:junctions.filter(j=>j.status==='excluded').length,pendingRegions:pendingCoverage.length}};
}
