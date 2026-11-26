import {regionContains} from './floor-core.js';

const radians = Math.PI/180;
const identity = [1,0,0,1,0,0];
const read = (record,code,fallback='')=>record.find(pair=>pair[0]===code)?.[1]??fallback;
const num = (record,code,fallback=0)=>Number(read(record,code,fallback));
const transform = (m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const multiply = (a,b)=>[
 a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],...transform(a,b.slice(4))
];

function category(layer){
 if(/企口|rebate/i.test(layer))return '企口';
 if(/洞口|洞边|opening|void/i.test(layer))return '洞口';
 if(/楼梯|梯板|stair/i.test(layer))return '楼梯';
 if(/板边线|楼板|楼面|(?:^|[-_])(?:slab|plate)(?:$|[-_])/i.test(layer))return '楼面';
 if(/板盖梁|挂梁|(?:^|[-_])GL(?:$|[-_])/i.test(layer))return '挂梁';
 if(/(?:^|[-_])(?:梁|beam)$|缺口梁|过梁/i.test(layer))return '梁';
 return '';
}

function bounds(points){
 return points.reduce(([l,b,r,t],[x,y])=>[Math.min(l,x),Math.min(b,y),Math.max(r,x),Math.max(t,y)],
  [Infinity,Infinity,-Infinity,-Infinity]);
}
const insideBox=([x,y],b)=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3];
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const planar=r=>Math.abs(num(r,210))<1e-8&&Math.abs(num(r,220))<1e-8&&Math.abs(num(r,230,1)-1)<1e-8;
const area2=ring=>Math.abs(ring.reduce((total,p,i)=>{const q=ring[(i+1)%ring.length];return total+p[0]*q[1]-p[1]*q[0];},0))/2;

function arc(center,radius,start,sweep,m){
 const scale=Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3]));
 const angle=2*Math.acos(Math.max(-1,1-.1/Math.max(.1,radius*scale)));
 const count=Math.min(2048,Math.max(2,Math.ceil(Math.abs(sweep)/angle)));
 return Array.from({length:count+1},(_,i)=>{
  const a=start+sweep*i/count;
  return [center[0]+radius*Math.cos(a),center[1]+radius*Math.sin(a)];
 });
}

function outline(vertices,matrix){
 const points=[];
 for(let i=0;i<vertices.length;i++){
  const {x,y,bulge}=vertices[i],b=vertices[(i+1)%vertices.length];
  if(!Number.isFinite(x+y+bulge))return null;
  const dx=b.x-x,dy=b.y-y;
  if(Math.hypot(dx,dy)<1e-9)continue;
  if(Math.abs(bulge)<1e-10){points.push(transform(matrix,[x,y]));continue;}
  const offset=(1-bulge*bulge)/(4*bulge);
  const center=[(x+b.x)/2-dy*offset,(y+b.y)/2+dx*offset];
  const radius=Math.hypot(x-center[0],y-center[1]);
  const start=Math.atan2(y-center[1],x-center[0]);
  for(const p of arc(center,radius,start,4*Math.atan(bulge),matrix).slice(0,-1))points.push(transform(matrix,p));
 }
 return points;
}

export function parseCadReference(bytes){
 if(bytes.subarray(0,22).includes(0))throw Error('请使用 ASCII DXF，当前文件为二进制 DXF');
 let input;
 try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{input=new TextDecoder('gb18030').decode(bytes);}
 const lines=input.trimEnd().split(/\r?\n/);
 if(lines.length%2||lines.at(-2).trim()!=='0'||lines.at(-1).trim()!=='EOF')throw Error('DXF 不完整，缺少有效的 EOF');
 const blocks=new Map(),entities=[];
 let section='',target=null,units=0;
 for(let i=0;i<lines.length;){
  if(lines[i].trim()!=='0')throw Error('DXF 实体头读取失败，行 '+(i+1));
  const type=lines[i+1].trim(),pairs=[];
  i+=2;
  while(i<lines.length&&lines[i].trim()!=='0'){
   const code=Number(lines[i].trim());
   if(!Number.isInteger(code)||lines[i].trim()==='')throw Error('DXF 组码无效，行 '+(i+1));
   pairs.push([code,lines[i+1].trim().replace(/\\U\+([A-F\d]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))]);
   i+=2;
  }
  if(type==='SECTION'){
   section=read(pairs,2);
   const index=pairs.findIndex(p=>p[0]===9&&p[1]==='$INSUNITS');
   if(index>=0)units=Number(pairs[index+1]?.[1]||0);
  }else if(type==='ENDSEC'){section='';target=null;}
  else if(section==='BLOCKS'){
   if(type==='BLOCK'){
    target={items:[],x:num(pairs,10),y:num(pairs,20),external:(num(pairs,70)&12)!==0};
    blocks.set(read(pairs,2).toUpperCase(),target);
   }else if(type==='ENDBLK')target=null;
   else if(target)target.items.push({type,pairs});
  }else if(section==='ENTITIES')entities.push({type,pairs});
 }
 const features=[],omitted={};
 let visited=0;
 function skip(type){omitted[type]=(omitted[type]||0)+1;}
 function walk(items,matrix,parentLayer,chain,stack){
  for(let i=0;i<items.length;i++){
   if(++visited>500000)throw Error('底图实体超过 50 万，请按楼层拆分后导入');
   const {type,pairs}=items[i],layout=read(pairs,410);
   if(num(pairs,67)===1||(layout&&layout.toUpperCase()!=='MODEL'))continue;
   const ownLayer=read(pairs,8,'0'),layer=ownLayer==='0'?parentLayer:ownLayer;
   const source=chain+read(pairs,5,'#'+i);
   if(type==='INSERT'){
    const key=read(pairs,2).toUpperCase(),block=blocks.get(key);
    if(!block||block.external||stack.has(key)||stack.size>=25||!planar(pairs)||num(pairs,70,1)>1||num(pairs,71,1)>1){skip('INSERT');continue;}
    const a=num(pairs,50)*radians,c=Math.cos(a),s=Math.sin(a),sx=num(pairs,41,1),sy=num(pairs,42,1);
    const m=[c*sx,s*sx,-s*sy,c*sy,num(pairs,10),num(pairs,20)];
    const [x,y]=transform(m,[block.x,block.y]);
    m[4]+=m[4]-x;m[5]+=m[5]-y;
    walk(block.items,multiply(matrix,m),layer,source+'/',new Set([...stack,key]));
    continue;
   }
   const label=category(layer);
   if(!label)continue;
   let polygon=null;
   if(type==='LWPOLYLINE'&&(num(pairs,70)&1)&&planar(pairs)){
    const vertices=[];
    for(const [code,value] of pairs){
     if(code===10)vertices.push({x:Number(value),y:NaN,bulge:0});
     else if(code===20&&vertices.length)vertices.at(-1).y=Number(value);
     else if(code===42&&vertices.length)vertices.at(-1).bulge=Number(value);
    }
    polygon=outline(vertices,matrix);
   }else if(type==='POLYLINE'){
    const vertices=[];
    while(items[i+1]?.type==='VERTEX'){
     const v=items[++i].pairs;
     vertices.push({x:num(v,10),y:num(v,20),bulge:num(v,42)});
    }
    if((num(pairs,70)&127)===1&&planar(pairs))polygon=outline(vertices,matrix);
   }else if(type==='CIRCLE'&&planar(pairs)&&num(pairs,40)>0){
    polygon=arc([num(pairs,10),num(pairs,20)],num(pairs,40),0,Math.PI*2,matrix).slice(0,-1).map(p=>transform(matrix,p));
   }
   if(!polygon||polygon.length<3||area2(polygon)<1e-6){skip(type);continue;}
   features.push({source,layer,category:label,polygon});
  }
 }
 walk(entities,identity,'0','',new Set());
 return {units,features,omitted};
}

function mappedFeature(feature,matrix){
 const polygon=feature.polygon.map(p=>transform(matrix,p));
 return {...feature,bounds:bounds(polygon),region:[{polygon,holes:[]}]};
}

export function matchCadReference(faces,reference,alignment){
 const {scale,rotation,x,y}=alignment,a=rotation*radians,c=Math.cos(a)*scale,s=Math.sin(a)*scale;
 const matrix=[c,s,-s,c,x,y];
 const mapped=reference.features.map(feature=>mappedFeature(feature,matrix));
 const matches=[];
 for(const face of faces){
  if(face.receiverOnly||face.topPlaneExcluded||face.direction!=='down'||!face.polygon?.length)continue;
  const box=bounds(face.polygon);
  const candidates=mapped.filter(feature=>intersects(box,feature.bounds));
  if(!candidates.length)continue;
  const tallies=new Map();
  let total=0;
  for(const t of face.triangles||[]){
   const at=[(t[0][0]+t[1][0]+t[2][0])/3,(t[0][1]+t[1][1]+t[2][1])/3],area=area2(t);
   total+=area;
   const hits=new Set();
   for(const f of candidates){
    if(!insideBox(at,f.bounds)||!regionContains(at,f.region))continue;
    if(!tallies.has(f.category))tallies.set(f.category,{area:0,sources:new Set(),layers:new Set()});
    const hit=tallies.get(f.category);
    hit.layers.add(f.layer);hit.sources.add(f.source);
    if(!hits.has(f.category)){hit.area+=area;hits.add(f.category);}
   }
  }
  if(!total)continue;
  const labels=[...tallies].filter(([,v])=>v.area/total>=.75).map(([label,v])=>({
   label,coverage:v.area/total,layers:[...v.layers],sources:[...v.sources]
  }));
  if(labels.length)matches.push({faceId:face.id,component:face.component,height:face.height,labels});
 }
 return {matches,mapped};
}

const cadUnitScale = {1:25.4,2:304.8,4:1,5:10,6:1000};
const structural = label => ['梁','楼面','挂梁','楼梯'].includes(label);

export function alignCadReference(faces,reference){
 const scale=cadUnitScale[reference.units]??1;
 const native=faces.filter(f=>!f.receiverOnly&&!f.topPlaneExcluded&&!f.sloped&&f.direction==='down'&&f.area>=40000&&f.polygon?.length);
 const cad=reference.features.filter(f=>structural(f.category));
 const seen=new Set();
 const footprints=native.map(f=>bounds(f.polygon)).filter(b=>{
  const key=b.map(v=>Math.round(v)).join('/');
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
 const center=b=>[(b[0]+b[2])/2,(b[1]+b[3])/2];
 const comparable=(a,b)=>[0,1].every(i=>{
  const w=a[i+2]-a[i],v=b[i+2]-b[i];
  return w>50&&Math.abs(w-v)<=Math.max(15,w*.025);
 });
 const trial=(rotation,x,y)=>({scale,rotation,x,y});
 const evaluate=alignment=>{
  const {matches}=matchCadReference(native,reference,alignment);
  // Identical projected floors count once as registration evidence.
  const distinct=new Map();
  const byId=new Map(native.map(f=>[f.id,f]));
  for(const match of matches){
   const labels=match.labels.filter(l=>structural(l.label));
   if(!labels.length)continue;
   const face=byId.get(match.faceId);
   const key=bounds(face.polygon).map(v=>Math.round(v/5)).join('/');
   const evidence=Math.max(...labels.map(l=>l.coverage));
   distinct.set(key,Math.max(distinct.get(key)||0,evidence));
  }
  return {alignment,count:distinct.size,score:[...distinct.values()].reduce((s,n)=>s+n,0)};
 };
 const identity=evaluate(trial(0,0,0));
 if(identity.count>=Math.max(6,Math.ceil(footprints.length*.2)))return identity;
 const votes=[];
 for(const rotation of [0,90,180,270]){
  const a=rotation*radians,c=Math.cos(a)*scale,s=Math.sin(a)*scale;
  const matrix=[c,s,-s,c,0,0],bins=new Map();
  for(const feature of cad){
   const b=bounds(feature.polygon.map(p=>transform(matrix,p)));
   const [cx,cy]=center(b);
   for(const frame of footprints){
    if(!comparable(frame,b))continue;
    const [nx,ny]=center(frame),x=nx-cx,y=ny-cy;
    const key=Math.round(x/25)+'/'+Math.round(y/25);
    if(!bins.has(key))bins.set(key,{x:0,y:0,count:0});
    const bin=bins.get(key);
    bin.x+=x;bin.y+=y;bin.count++;
   }
  }
  for(const bin of [...bins.values()].sort((a,b)=>b.count-a.count).slice(0,4)){
   if(bin.count>=3)votes.push({...trial(rotation,bin.x/bin.count,bin.y/bin.count),votes:bin.count});
  }
 }
 const candidates=[identity];
 for(const {votes:count,...alignment} of votes.sort((a,b)=>b.votes-a.votes).slice(0,10)){
  if(candidates.some(c=>c.alignment.rotation===alignment.rotation&&Math.hypot(c.alignment.x-alignment.x,c.alignment.y-alignment.y)<50))continue;
  candidates.push(evaluate(alignment));
 }
 candidates.sort((a,b)=>b.score-a.score);
 const [best,next]=candidates;
 const minimum=Math.min(12,Math.max(4,Math.ceil(footprints.length*.12)));
 if(best.count<minimum)return {reason:'二维轮廓与装配体重合证据不足',count:best.count};
 if(next&&next.score>=best.score*.92)return {reason:'发现多个接近的配准位置',count:best.count};
 return best;
}
