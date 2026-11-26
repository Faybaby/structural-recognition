import {matchBeamPattern} from './support-rule-matching.js';
import {regionContains} from './floor-core.js';
import {resolveSlabThickness,withBeamSlabThickness} from './slab-thickness.js';
const EPS=1e-6;
export function beamLookup(input,{width,height,thickness}){
 if(![width,height].every(v=>Number.isFinite(v)&&v>0))return null;
 thickness=resolveSlabThickness(thickness).calculationValue;
 const rows=input.index.filter(r=>r.storyHeight===input.storyHeight&&r.width>=width-EPS&&r.height>=height-EPS&&r.thickness>=thickness-EPS&&r.spacing>0).sort((a,b)=>a.width-b.width||a.height-b.height||a.thickness-b.thickness);
 return rows[0]||null;
}
export function layoutBeamSpan({length,gw,ends,spacing,originProjection=0}){
 const fail=reason=>({status:'pending',reasons:[reason],nodes:[]});
 if(!(length>0&&spacing>0&&Number.isFinite(originProjection)))return fail('长度、索引间距或基准无效');
 const small=gw<=150+EPS,lo=small?100:50,hi=small?130:80,preferred=small?100:50;
 if(ends.some(e=>e.type==='yang')&&gw<80-EPS)return fail('GW1<80mm未提供阳线端部规则');
 const nodes=[],endOffsets=[];let left=0,right=length;
 for(let i=0;i<2;i++){
  const e=ends[i];if(!['yin','yang'].includes(e.type))return fail('阴/阳端类型尚未确认');if(e.type==='yin'){endOffsets.push(null);continue;}
  const first=i===0?lo:length-hi,last=i===0?hi:length-lo,candidates=[];
  for(let k=Math.ceil((first+originProjection-EPS)/50);k<=Math.floor((last+originProjection+EPS)/50);k++){
   const t=k*50-originProjection,offset=i===0?t:length-t;if(t>EPS&&t<length-EPS)candidates.push({t,offset});
  }
  candidates.sort((a,b)=>Math.abs(a.offset-preferred)-Math.abs(b.offset-preferred)||a.offset-b.offset);
  if(!candidates.length)return fail(`第${i+1}端GLL1=${lo}～${hi}mm内无基准50mm模数点`);
  const point=candidates[0];nodes.push({t:point.t,origin:'阳线端部',end:i,gll:point.offset});endOffsets.push(point.offset);if(i===0)left=point.t;else right=point.t;
 }
 const gtt=right-left;if(gtt<=EPS)return fail('两端阳线点交叉或GTT不足');
 let mode,h=null,phase=null;
 if(gtt<spacing-EPS)mode=ends.every(e=>e.type==='yin')?'GTT＜XX，双阴线不新增':'GTT＜XX，仅保留阳线点';
 else if(gtt<=2*spacing+EPS){
  const center=(left+right)/2,candidates=[Math.floor((center+originProjection)/50)*50-originProjection,Math.ceil((center+originProjection)/50)*50-originProjection].filter(t=>t>left+EPS&&t<right-EPS).sort((a,b)=>Math.abs(a-center)-Math.abs(b-center)||a-b);
  if(!candidates.length)return fail('居中位置没有有效50mm模数点');
  const t=candidates[0];nodes.push({t,origin:'居中补点'});h=[t-left,right-t];mode='XX≤GTT≤2XX，居中补1点';
 }else{
  let best=null;
  for(let px=0;px<spacing;px+=50){
   const first=Math.ceil((left+500+originProjection-px-EPS)/spacing),last=Math.floor((right-500+originProjection-px+EPS)/spacing),values=[];
   for(let k=first;k<=last;k++)values.push(px+k*spacing-originProjection);
   if(!values.length)continue;const h1=values[0]-left,h2=right-values.at(-1);
   if(h1<500-EPS||h2<500-EPS||h1>=spacing-100-EPS||h2>=spacing-100-EPS)continue;
   const score=[Math.abs(h1-h2),values.length,px];if(!best||score.some((v,i)=>v<best.score[i]&&score.slice(0,i).every((q,j)=>q===best.score[j])))best={values,h:[h1,h2],phase:px,score};
  }
  if(!best)return fail('长梁没有同时满足500≤H＜XX−100、固定XX及50模数的方案');
  nodes.push(...best.values.map(t=>({t,origin:'长梁补点'})));h=best.h;phase=best.phase;mode='GTT＞2XX，固定XX补点并均衡H1/H2';
 }
 nodes.sort((a,b)=>a.t-b.t);
 return {status:'passed',reasons:[],nodes,gtt,anchors:[left,right],endOffsets,h,phase,mode,caseNumber:matchBeamPattern({ends}).endCase,spacing,actualGaps:nodes.slice(1).map((n,i)=>n.t-nodes[i].t),longRule:gtt>2*spacing+EPS};
}
export function calculateBeams(input,settings){
 const beams=input.beams.map(source=>{
  const b=withBeamSlabThickness(source);
  const base=settings.global,r={...b,base,status:'pending',reasons:[...b.issues],nodes:[],gdModel:'GD100X'+Number(b.width.toFixed(3)),baselineRevision:settings.revision};
  r.matchedRule=matchBeamPattern(b,{kind:'gl'});r.calculationPipeline=['核验阴阳端','匹配既有情况','向上查表','阳端/GTT补点','实体底面校验','当前模型承接'];
  if(!base)r.reasons.push('尚未保存整楼基准');
  if(![b.width,b.height,b.thickness].every(v=>Number.isFinite(v)&&v>0))r.reasons.push('实体梁宽、GL梁高或相邻板厚缺项');
  if(r.reasons.length)return r;
  const index=beamLookup(input,b);r.index=index;if(!index){r.reasons.push('向上查找仍无对应梁宽×梁高／板厚档位');return r;}
  if(index.spacing%50!==0){r.reasons.push('索引间距不兼容50mm模数');return r;}
  const tangent=b.end.map((v,i)=>(v-b.start[i])/b.length),originProjection=b.start.reduce((s,v,i)=>s+(v-base.origin[i])*tangent[i],0),layout=layoutBeamSpan({length:b.length,gw:b.gw,ends:b.ends,spacing:index.spacing,originProjection});
  Object.assign(r,layout,{originProjection,tangent});if(layout.status!=='passed')return r;
  r.nodes=layout.nodes.map((n,i)=>({...n,id:b.id+'-P'+String(i+1).padStart(3,'0'),world:b.start.map((v,j)=>v+n.t*tangent[j]),sourceHeight:b.bottom,sourceFace:b.sourceFace,sourceRegion:b.memberIds[0],model:r.gdModel,axisCoordinate:n.t+originProjection}));
  if(r.nodes.some(n=>!regionContains(n.world,b.region))){r.status='pending';r.reasons=['点位未落入实际GL底面'];r.nodes=[];}
  return r;
 });
 const groups=new Map();for(const r of beams){const key=JSON.stringify([r.start,r.end,r.bottom,r.width,r.height,r.thickness]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 for(const group of groups.values())for(const r of group){r.alignedModels=group.map(q=>q.id);r.alignmentChecked=group.every(q=>q.status===r.status&&JSON.stringify(q.nodes.map(n=>n.world))===JSON.stringify(r.nodes.map(n=>n.world)));if(!r.alignmentChecked&&r.status==='passed'){r.status='pending';r.reasons=['上下层对应GL梁点位不一致'];r.nodes=[];}}
 return {version:1,baselineRevision:settings.revision,source:input.source,rules:input.rules,storyHeight:input.storyHeight,beams,summary:{beams:beams.length,passed:beams.filter(r=>r.status==='passed').length,pending:beams.filter(r=>r.status==='pending').length,zero:beams.filter(r=>r.status==='passed'&&!r.nodes.length).length,uniqueModelPoints:beams.reduce((s,r)=>s+r.nodes.length,0),endPoints:beams.reduce((s,r)=>s+r.nodes.filter(n=>n.origin==='阳线端部').length,0),interiorPoints:beams.reduce((s,r)=>s+r.nodes.filter(n=>n.origin!=='阳线端部').length,0)}};
}
