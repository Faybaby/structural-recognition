import {matchBeamPattern} from './support-rule-matching.js';
// Ordinary beams have their own end-margin rule; GL and slab solvers stay independent.
import {layoutBeamSpan} from './beam-core.js';
const EPS=1e-6;
export function layoutOrdinaryArc({length,spacing,neighborOffsets=[0,0]}){
 if(!(length>0&&spacing>0))return {status:'pending',nodes:[],reasons:['圆弧长度或间距无效']};
 const [a,b]=neighborOffsets,total=length+a+b;
 let divisions=Math.max(2,Math.ceil((total-EPS)/spacing)),values=[];
 for(;divisions<10000;divisions++){
  values=Array.from({length:divisions-1},(_,i)=>(i+1)*total/divisions-a);
  if(values.every(t=>t>EPS&&t<length-EPS))break;
 }
 if(divisions>=10000)return {status:'pending',nodes:[],reasons:['弧段及相邻端距无法等分满足间距']};
 return {status:'passed',nodes:values.map(t=>({t,origin:'圆弧等分点',modulusException:'按真实中心线弧长等分'})),reasons:[],gtt:length,anchors:[0,length],endOffsets:[null,null],spacing,divisions,arcRule:true,neighborOffsets,yh:[values[0]+a,length-values.at(-1)+b],h:[values[0],length-values.at(-1)],actualGaps:values.slice(1).map((t,i)=>t-values[i]),mode:divisions===2?'圆弧居中1点，YH1/YH2≤XX':'圆弧及邻段端距按'+divisions+'段等分，YH1/YH2≤XX',longRule:false};
}
export function layoutOrdinarySpan(args){
 const {length,gw,ends,spacing,originProjection=0}=args;
 // Reuse confirmed end identification and short-span branches without changing GL.
 if(!(length>0&&spacing>100&&Number.isFinite(originProjection)))return {status:'pending',nodes:[],reasons:['长度、间距或基准无效']};
 const nodes=[],endOffsets=[];let left=0,right=length;
 for(let i=0;i<2;i++){
  const type=ends[i]?.type;if(type==='yin'){endOffsets.push(null);continue;}
  if(type!=='yang'||gw<80-EPS)return {status:'pending',nodes:[],reasons:['端部阴阳线或GW1范围尚未确认']};
  const lo=gw<=150+EPS?100:50,hi=gw<=150+EPS?130:80,candidates=[];
  const first=i===0?lo:length-hi,last=i===0?hi:length-lo;
  for(let k=Math.ceil((first+originProjection-EPS)/50);k<=Math.floor((last+originProjection+EPS)/50);k++){
   const t=k*50-originProjection,offset=i===0?t:length-t;if(t>EPS&&t<length-EPS)candidates.push({t,offset});
  }
  candidates.sort((a,b)=>a.offset-b.offset);
  if(!candidates.length)return {status:'pending',nodes:[],reasons:[`第${i+1}端GLL1=${lo}～${hi}mm内无基准50mm模数点`]};
  const p=candidates[0];nodes.push({t:p.t,origin:'阳线端部',end:i,gll:p.offset});endOffsets.push(p.offset);if(i===0)left=p.t;else right=p.t;
 }
 const gtt=right-left;if(gtt<=EPS)return {status:'pending',nodes:[],reasons:['两端阳线点交叉或GTT不足']};
 if(gtt<=2*spacing+EPS){
  const short=layoutBeamSpan(args);
  // The reviewed 1150mm tail with XX=1200 still needs a support: its
  // distance to the end may not reach XX-100, even though GTT is below XX.
  if(short.status==='passed'&&gtt<spacing-EPS&&gtt>=spacing-100-EPS){
   const center=(left+right)/2,choices=[Math.floor((center+originProjection)/50)*50-originProjection,Math.ceil((center+originProjection)/50)*50-originProjection].filter(t=>t>left+EPS&&t<right-EPS);
   choices.sort((a,b)=>Math.abs(a-center)-Math.abs(b-center)||a-b);
   if(!choices.length)return {status:'pending',nodes:[],reasons:['端距复核补点没有有效50mm模数位置']};
   short.nodes.push({t:choices[0],origin:'端距上限补点'});short.nodes.sort((a,b)=>a.t-b.t);short.h=[choices[0]-left,right-choices[0]];short.mode='GTT＜XX但端距≥XX−100，居中补1点';short.endMaxExclusive=spacing-100;short.marginCorrection=true;
  }
  return short;
 }
 // Prefer the fewest fixed-XX intervals satisfying the upper end-margin bound,
 // then balance the two ends. Ordinary-beam H may be below 500mm (CAD revision).
 let best=null;
 const maxCount=Math.ceil(gtt/spacing)+1;
 for(let count=2;count<=maxCount;count++){
  const remainder=gtt-(count-1)*spacing;if(remainder<=2*EPS)break;
  const lo=Math.max(EPS,remainder-(spacing-100)+EPS),hi=Math.min(spacing-100-EPS,remainder-EPS),target=remainder/2,choices=[];
  for(let k=Math.ceil((left+lo+originProjection)/50);k<=Math.floor((left+hi+originProjection)/50);k++){
   const t=k*50-originProjection,h1=t-left,h2=remainder-h1;
   if(h1>EPS&&h2>EPS&&h1<spacing-100-EPS&&h2<spacing-100-EPS)choices.push({t,h:[h1,h2]});
  }
  choices.sort((a,b)=>Math.abs(a.h[0]-target)-Math.abs(b.h[0]-target)||a.t-b.t);
  if(choices.length){best={...choices[0],count};break;}
 }
 if(!best)return {status:'pending',nodes:[],reasons:['长梁没有同时满足固定XX、0＜H＜XX−100与50mm模数的方案']};
 nodes.push(...Array.from({length:best.count},(_,i)=>({t:best.t+i*spacing,origin:'长梁补点'})));nodes.sort((a,b)=>a.t-b.t);
 return {status:'passed',nodes,reasons:[],gtt,anchors:[left,right],endOffsets,h:best.h,phase:(best.t+originProjection)%spacing,mode:'GTT＞2XX，固定XX，端距尽量均分（允许＜500）',caseNumber:matchBeamPattern({ends}).endCase,spacing,actualGaps:nodes.slice(1).map((n,i)=>n.t-nodes[i].t),longRule:true,endMin:0,endMaxExclusive:spacing-100};
}
