import {regionContains} from './floor-core.js';

const EPS=.05, TAU=2*Math.PI;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const times=(v,k)=>[v[0]*k,v[1]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const length=v=>Math.hypot(...v);
const mod=v=>((v%TAU)+TAU)%TAU;
const radial=(c,r,a)=>add(c,[r*Math.cos(a),r*Math.sin(a)]);
const order=(a,b)=>a[0]-b[0]||a[1]-b[1];
const allowedWidth=w=>w>=80-EPS&&w<=1200+EPS;
const boundaryDistance=(p,e)=>{
 const v=sub(e.end,e.start),d=dot(v,v);
 return length(sub(p,add(e.start,times(v,d?Math.max(0,Math.min(1,dot(sub(p,e.start),v)/d)):0))));
};
const along=(a,b,t)=>add(a,times(sub(b,a),t));

function circleInterval(edge){
 const center=edge.circleCenter?.slice(0,2),radius=edge.circleRadius,points=edge.curvePoints;
 if(!center||!(radius>0)||!points||points.length<3)return null;
 if(points.some(p=>Math.abs(length(sub(p,center))-radius)>.02))return null;
 const angle=p=>Math.atan2(p[1]-center[1],p[0]-center[0]);
 let start=angle(points[0]),previous=start,sweep=0;
 for(const p of points.slice(1)){
  const next=angle(p);sweep+=Math.atan2(Math.sin(next-previous),Math.cos(next-previous));previous=next;
 }
 if(Math.abs(sweep)<1e-7||Math.abs(sweep)>=TAU-1e-6)return null;
 if(sweep<0){start+=sweep;sweep=-sweep;}
 return {center,radius,start:mod(start),sweep};
}

export function nativeBeamSegments(face){
 const region=[{polygon:face.polygon,holes:face.holes||[]}];
 const edges=(face.edges||[]).filter(e=>e.outer!==false).map((e,i)=>({...e,index:i,start:e.start.slice(0,2),end:e.end.slice(0,2)}));
 const inside=p=>regionContains(p,region);
 const outlines=[face.polygon,...(face.holes||[])];
 const boundaries=outlines.flatMap(r=>r.map((a,i)=>[a,r[(i+1)%r.length]]));
 function sectionInside(a,b){
  if(!inside(along(a,b,.5)))return false;
  const ab=sub(b,a);
  // An interior contour crossing means these are not the two sides of one strip.
  for(const [p,q] of boundaries){
   const v=sub(q,p),d=cross(ab,v);
   if(Math.abs(d)<1e-8)continue;
   const ap=sub(p,a),t=cross(ap,v)/d,u=cross(ap,ab)/d;
   if(t>EPS/length(ab)&&t<1-EPS/length(ab)&&u>=-1e-8&&u<=1+1e-8)return false;
  }
  return [.05,.25,.75,.95].every(t=>inside(along(a,b,t)));
 }
 const lines=edges.filter(e=>e.isLine&&length(sub(e.end,e.start))>=50);
 const circles=edges.filter(e=>!e.isLine).map(edge=>({edge,arc:circleInterval(edge)})).filter(e=>e.arc);
 const routes=[];
 for(let i=0;i<lines.length;i++)for(const b of lines.slice(i+1)){
  const a=lines[i],v=sub(a.end,a.start),l=length(v),u=times(v,1/l),n=[-u[1],u[0]],bv=sub(b.end,b.start);
  if(Math.abs(cross(u,bv))/length(bv)>1e-5)continue;
  const signed=dot(sub(b.start,a.start),n),width=Math.abs(signed);
  if(!allowedWidth(width))continue;
  const ts=[b.start,b.end].map(p=>dot(sub(p,a.start),u)).sort((x,y)=>x-y);
  const lo=Math.max(0,ts[0]),hi=Math.min(l,ts[1]),L=hi-lo;
  if(L<100-EPS)continue;
  const at=t=>add(a.start,times(u,t)),other=p=>add(p,times(n,signed));
  const sections=[lo,hi].map(t=>[at(t),other(at(t))]);
  const stations=[lo+Math.min(.1,L/10),hi-Math.min(.1,L/10)];
  for(let j=1,count=Math.ceil(L/150);j<count;j++)stations.push(lo+L*j/count);
  if(stations.some(t=>{const p=at(t);return !sectionInside(p,other(p));}))continue;
  let [start,end]=sections.map(([p,q])=>along(p,q,.5));
  let sides=signed>0?[b,a]:[a,b];
  if(order(start,end)>0){[start,end]=[end,start];sections.reverse();sides=sides.reverse();}
  routes.push({start,end,width,length:L,path:{type:'line',start,end,length:L},sections,sides});
 }
 for(let i=0;i<circles.length;i++)for(const b of circles.slice(i+1)){
  const a=circles[i],ac=a.arc,bc=b.arc,width=Math.abs(ac.radius-bc.radius);
  if(length(sub(ac.center,bc.center))>EPS||!allowedWidth(width))continue;
  const radius=(ac.radius+bc.radius)/2,center=ac.center;
  for(const offset of [-TAU,0,TAU]){
   const lo=Math.max(ac.start,bc.start+offset),hi=Math.min(ac.start+ac.sweep,bc.start+bc.sweep+offset),sweep=hi-lo,L=radius*sweep;
   if(L<100-EPS)continue;
   const section=angle=>[radial(center,ac.radius,angle),radial(center,bc.radius,angle)];
   const count=Math.max(4,Math.ceil(L/100));
   if(Array.from({length:count},(_,j)=>section(lo+sweep*(j+.5)/count)).some(([p,q])=>!sectionInside(p,q)))continue;
   const start=radial(center,radius,lo),end=radial(center,radius,hi);
   routes.push({start,end,width,length:L,path:{type:'arc',center,radius,angle:lo,sweep,length:L},sections:[section(lo),section(hi)],sides:[a.edge,b.edge],arcCoverage:[[lo-ac.start,hi-ac.start],[lo-bc.start-offset,hi-bc.start-offset]]});
  }
 }
 const unique=routes.filter((r,i)=>!routes.slice(0,i).some(q=>q.path.type===r.path.type&&Math.abs(q.width-r.width)<EPS&&length(sub(q.start,r.start))<EPS&&length(sub(q.end,r.end))<EPS));
 unique.sort((a,b)=>order(a.start,b.start)||order(a.end,b.end)||a.width-b.width);
 const tangent=(r,i)=>r.path.type==='line'?times(sub(r.end,r.start),1/r.length):[-Math.sin(r.path.angle+i*r.path.sweep),Math.cos(r.path.angle+i*r.path.sweep)];
 function sharesSection(a,b){
  const u=sub(a[1],a[0]),l=length(u),d=times(u,1/l);
  if(b.some(p=>Math.abs(cross(sub(p,a[0]),d))>EPS))return false;
  const ts=b.map(p=>dot(sub(p,a[0]),d)).sort((x,y)=>x-y);
  return Math.min(l,ts[1])-Math.max(0,ts[0])>EPS;
 }
 for(const route of unique){
  route.connections=route.sections.map((section,i)=>unique.filter(other=>other!==route&&other.sections.some((s,j)=>Math.abs(dot(tangent(route,i),tangent(other,j)))>1-1e-6&&sharesSection(section,s))));
  route.ends=route.sections.map((section,i)=>{
   const at=i?route.end:route.start,u=tangent(route,i);
   const caps=lines.filter(e=>boundaryDistance(at,e)<EPS&&Math.abs(dot(u,sub(e.end,e.start)))/length(sub(e.end,e.start))<.95);
   if(caps.some(e=>e.type==='yin'))return {type:'yin',nativeType:'yin',reason:'原生横边为阴线，保留阴线优先'};
   if(caps.length&&caps.every(e=>e.type==='yang'))return {type:'yang',nativeType:'yang',reason:'原生横边为阳线'};
   if(!caps.length&&route.connections[i].length)return {type:'yin',nativeType:'calculation-cut',partitionYin:true,reason:route.path.type==='arc'||route.connections[i].some(q=>q.path.type==='arc')?'三维相切分界，按计算端处理':'变宽或同面连续分界，按计算端处理'};
   if(!caps.length&&inside(at))return {type:'unknown',reason:'分段端进入实体面，尚未证实连接或阴线分界'};
   return {type:'unknown',reason:'未核实真实梁端阴阳线'};
  });
 }
 for(const r of unique){
  if(r.path.type!=='line')continue;
  const yin=r.sides.findIndex(e=>e.type==='yin'),yang=r.sides.findIndex(e=>e.type==='yang');
  if(yin===-1||yang===-1)continue;
  const confirmedCut=r.sections.some((section,i)=>r.connections[i].some(q=>q.path.type==='line'&&q.width>r.width+EPS)&&lines.some(e=>e.type==='yin'&&e.index!==r.sides[0].index&&e.index!==r.sides[1].index&&section.some(p=>boundaryDistance(p,e)<EPS)&&Math.abs(dot(tangent(r,i),sub(e.end,e.start)))/length(sub(e.end,e.start))<.05));
  if(!confirmedCut)continue;
  const wn=r.width;
  const offset=wn<=200+1e-6?0:wn<=300+1e-6?50:100;
  r.wnRule={width:wn,exempt:offset===0,offset,yangSide:yang===0?'left':'right'};
 }
 const uncovered=[];
 for(const edge of edges.filter(e=>!e.isLine)){
  const arc=circleInterval(edge);
  if(!arc){uncovered.push(edge);continue;}
  const coverage=unique.filter(r=>r.arcCoverage&&r.sides.some(s=>s.index===edge.index))
   .map(r=>r.arcCoverage[r.sides.findIndex(s=>s.index===edge.index)]).sort((a,b)=>a[0]-b[0]);
  let covered=0;
  for(const [lo,hi] of [...coverage,[arc.sweep,arc.sweep]]){
   if((lo-covered)*arc.radius>EPS){
    const gapSamples=Array.from({length:17},(_,i)=>radial(arc.center,arc.radius,arc.start+covered+(lo-covered)*i/16));
    uncovered.push({...edge,curvePoints:gapSamples});
   }
   covered=Math.max(covered,hi);
  }
 }

 return {routes:unique,uncovered,region};
}
