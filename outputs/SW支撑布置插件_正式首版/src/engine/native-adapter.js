import {recognizeRebates} from './native-rebates.js';
import {nativeBeamSegments} from './native-beam-segments.js';
import {applyRouteReview} from './review-parameters.js';
import {regionContains,ringDistance} from './floor-core.js';
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,t)=>a.map(v=>v*t),len=a=>Math.hypot(...a);
const bounds=ring=>[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
export function beamRoutes(f){
 let ring=f.polygon.map(p=>p.slice(0,2));
 // Collinear topology subdivisions do not split a continuous native beam.
 let changed=true;while(changed&&ring.length>3){changed=false;for(let i=0;i<ring.length;i++){const a=ring[(i+ring.length-1)%ring.length],b=ring[i],c=ring[(i+1)%ring.length],u=sub(b,a),v=sub(c,b);if(Math.abs(u[0]*v[1]-u[1]*v[0])<=.01*Math.max(1,len(u)+len(v))&&dot(u,v)>=0){ring.splice(i,1);changed=true;break;}}}
 const region=[{polygon:ring,holes:f.holes||[]}],candidates=[];
 for(let i=0;i<ring.length;i++)for(let j=i+1;j<ring.length;j++){
  const a=ring[i],b=ring[(i+1)%ring.length],c=ring[j],d=ring[(j+1)%ring.length],v=sub(b,a),w=sub(d,c),l=len(v);if(l<50||len(w)<50)continue;
  const u=mul(v,1/l),n=[-u[1],u[0]];if(Math.abs(dot(u,w)/len(w))<.99999)continue;
  const width=Math.abs(dot(sub(c,a),n));if(width<30||width>1200)continue;
  const ts=[dot(sub(c,a),u),dot(sub(d,a),u)],lo=Math.max(0,Math.min(...ts)),hi=Math.min(l,Math.max(...ts));if(hi-lo<Math.max(150,width))continue;
  const mid=mul(n,dot(sub(c,a),n)/2),start=add(add(a,mul(u,lo)),mid),end=add(add(a,mul(u,hi)),mid);
  if([.05,.25,.5,.75,.95].some(t=>!regionContains(add(start,mul(sub(end,start),t)),region)))continue;
  // Extend the centreline to its actual trimmed-face boundary, including oblique end caps.
  const midPoint=mul(add(start,end),.5),cuts=[];
  for(const loop of [ring,...(f.holes||[])])for(let k=0;k<loop.length;k++){const q=loop[k],z=loop[(k+1)%loop.length],edge=sub(z,q),den=u[0]*edge[1]-u[1]*edge[0];if(Math.abs(den)<1e-8)continue;const delta=sub(q,midPoint),station=(delta[0]*edge[1]-delta[1]*edge[0])/den,s=(delta[0]*u[1]-delta[1]*u[0])/den;if(s>=-1e-8&&s<=1+1e-8)cuts.push(station);}
  cuts.sort((a,b)=>a-b);const left=cuts.filter(v=>v<=1e-7).at(-1),right=cuts.find(v=>v>=-1e-7);
  const first=Number.isFinite(left)?add(midPoint,mul(u,left)):start,last=Number.isFinite(right)?add(midPoint,mul(u,right)):end,L=len(sub(last,first));
  if(L<Math.max(150,width))continue;
  candidates.push({start:first,end:last,width,length:L,path:{type:'line',start:first,end:last,length:L}});
 }
 candidates.sort((a,b)=>a.width-b.width||b.length-a.length);
 const out=[];for(const c of candidates){if(out.some(r=>Math.abs(r.width-c.width)<.05&&Math.abs(dot(mul(sub(r.end,r.start),1/r.length),mul(sub(c.end,c.start),1/c.length)))>.99999&&len(sub(mul(add(r.start,r.end),.5),mul(add(c.start,c.end),.5)))<Math.max(r.length,c.length)/2))continue;out.push(c);}return out;
}

function endEvidence(f,point,tangent){
 const edges=(f.edges||[]).filter(e=>{const a=e.start.slice(0,2),b=e.end.slice(0,2),v=sub(b,a),l=len(v);if(!l||Math.abs(dot(v,tangent)/l)>.99999)return false;const t=Math.max(0,Math.min(1,dot(sub(point,a),v)/(l*l)));return len(sub(point,add(a,mul(v,t))))<.2;});
 if(!edges.length)return {type:'unknown',reason:'路线端部未对应唯一真实横向边，保留待核对'};
 if(edges.some(e=>e.type==='yin'))return {type:'yin',reason:edges.filter(e=>e.type==='yin').map(e=>e.reason).join('；')};
 if(edges.every(e=>e.type==='yang'))return {type:'yang',reason:edges.map(e=>e.reason).join('；')};
 return {type:'unknown',reason:'端部含共面接缝或缺少凹凸证据'};
}

// Confirm a local slab from its two native faces before using a main floor level.
function matchingSlabTop(bottom,tops){
 if(bottom.sloped||!(bottom.area>0))return null;
 const box=bounds(bottom.polygon);
 if(Math.min(box[2]-box[0],box[3]-box[1])<1000)return null;
 // Check the actual transverse extent too, so a diagonal narrow beam does not qualify.
 for(const edge of bottom.edges||[]){
  if(!edge.isLine)continue;
  const v=sub(edge.end.slice(0,2),edge.start.slice(0,2)),l=len(v);
  if(l<50)continue;
  const n=[-v[1]/l,v[0]/l],values=bottom.polygon.map(q=>dot(q,n));
  if(Math.max(...values)-Math.min(...values)<1000)return null;
 }
 function sameBoundary(a,b){
  const near=(p,ring)=>ringDistance(p,ring)<=.08;
  // Curves are tessellated for the outline, so check both directions with a small chord tolerance.
  return a.every(p=>near(p,b))&&b.every(p=>near(p,a));
 }
 const holes=bottom.holes||[];
 return tops.find(top=>{
  const gap=top.height-bottom.height;
  if(gap<99.9||gap>250.1||Math.abs(top.area-bottom.area)>Math.max(1,bottom.area*1e-6))return false;
  if(!bounds(top.polygon).every((v,i)=>Math.abs(v-box[i])<=.08))return false;
  const openings=top.holes||[];
  return openings.length===holes.length&&sameBoundary(bottom.polygon,top.polygon)&&
   holes.every(h=>openings.some(q=>sameBoundary(h,q)));
 });
}

export function inferNativeParameters(scan,opt={}){
 const components=[...new Set(scan.faces.map(f=>f.component))],levels=[],topFaces=new Map();
 for(const component of components){const tops=scan.faces.filter(f=>f.component===component&&f.direction==='up'&&!f.sloped&&!f.receiverOnly),max=Math.max(0,...tops.map(f=>f.area||0));
  topFaces.set(component,tops);
  if(max<1000000)continue;
  for(const f of tops.filter(f=>f.area>=max*.2))if(!levels.some(l=>l.component===component&&Math.abs(l.height-f.height)<.1))levels.push({component,height:f.height,sourceFace:f.id,area:f.area});
 }
 const faces=scan.faces.map(f=>{
  if(f.topPlaneExcluded||f.receiverOnly||f.direction!=='down'||f.areaExcluded||f.shortSlopeExcluded||f.kind==='exclude')return f;
  const top=matchingSlabTop(f,topFaces.get(f.component)||[]);
  if(top){
   const thickness=top.height-f.height;
   const evidence='局部板顶与板底轮廓吻合：'+top.height.toFixed(1)+' − '+f.height.toFixed(1)+' = '+thickness.toFixed(1)+'mm；板顶原生面 '+top.id;
   return {...f,kind:'floor',thickness,beamHeight:0,floorLevel:top.height,parameterEvidence:evidence,reason:f.reason+'；'+evidence};
  }
  const upper=levels.filter(l=>l.component===f.component&&l.height>f.height+.1&&l.height-f.height<=(opt.storyHeight||3000)+.1).sort((a,b)=>a.height-b.height)[0];
  if(!upper)return f;const gap=upper.height-f.height;let kind=f.kind,thickness=f.thickness,beamHeight=f.beamHeight;
  const routes=f.hasCurves?nativeBeamSegments(f).routes:beamRoutes(f),thinBeam=routes.length&&routes.some(r=>r.width<=1200&&r.length>r.width*2);
  if(!f.sloped&&gap>=100-.1&&gap<=250+.1){kind='floor';if(!(thickness>0))thickness=gap;}
  else if(gap>250&&thinBeam&&kind==='floor')kind='ordinary';
  if(['ordinary','gl'].includes(kind)&&!(beamHeight>0))beamHeight=gap;
  const evidence='三维主楼面顶标高 '+upper.height.toFixed(1)+' − 本面标高 '+f.height.toFixed(1)+' = '+gap.toFixed(1)+'mm；主面引用 '+upper.sourceFace;
  return {...f,kind,thickness,beamHeight,floorLevel:upper.height,parameterEvidence:evidence,reason:f.reason+'；'+evidence};
 });return {faces,levels};
}

export function reviewNativeFaces(scan,opt={}){
 const inferred=inferNativeParameters(scan,opt);return recognizeRebates(inferred.faces,scan.rebateCatalog,scan.axis||opt.axis).map(f=>{
  if(f.topPlaneExcluded||f.receiverOnly||f.areaExcluded||f.shortSlopeExcluded||f.direction!=='down'||!['ordinary','gl'].includes(f.kind))return {...f,startType:'na',endType:'na',autoRoutes:[]};
  const plain=f.hasCurves?[]:beamRoutes(f),routes=(f.hasCurves||plain.length>1)&&f.edges?.length&&f.kind==='ordinary'?nativeBeamSegments(f).routes:plain;
  const autoRoutes=routes.map(r=>{if(r.ends)return {start:r.start,end:r.end,startType:r.ends[0].type,endType:r.ends[1].type,startReason:r.ends[0].reason,endReason:r.ends[1].reason};const tangent=mul(sub(r.end,r.start),1/r.length),a=endEvidence(f,r.start,tangent),b=endEvidence(f,r.end,tangent);return {start:r.start,end:r.end,startType:a.type,endType:b.type,startReason:a.reason,endReason:b.reason};});
  const common=key=>autoRoutes.length&&autoRoutes.every(r=>r[key]===autoRoutes[0][key])?autoRoutes[0][key]:autoRoutes.length>1?'per-route':'unknown';
  return {...f,autoRoutes,startType:common('startType'),endType:common('endType'),reason:f.reason+'；自动阴阳端：'+autoRoutes.map((r,i)=>'R'+(i+1)+'首端 '+r.startReason+'，末端 '+r.endReason).join('；')};
 });
}

export function nativePayload(scan,opt,indexes,reviews=[]){
 const floors=[],beams=[],gl=[],groups=[],sources=[],pending=[];
 const selected=scan.faces.filter(f=>f.confirmed&&f.kind!=='exclude'&&!(f.direction==='down'&&(f.rebateLink||f.topPlaneExcluded||f.shortSlopeExcluded||(f.sloped&&f.shortEdgeLength>0&&Math.round(f.shortEdgeLength*1e6)/1e6<100)||f.areaExcluded||(f.area>0&&f.area<=40000.000001)))).map(f=>f.direction==='up'?{...f,kind:'receiver'}:f);
const levels=[];for(const h of selected.filter(f=>f.direction==='down').map(f=>f.height+(f.kind==='floor'?(f.thickness>0?f.thickness:150):(f.beamHeight>0?f.beamHeight:0))).concat(scan.faces.some(f=>f.direction==='up')?[Math.min(...scan.faces.filter(f=>f.direction==='up').map(f=>f.height))]:[]).sort((a,b)=>a-b)){if(!levels.some(v=>Math.abs(v-h)<.05))levels.push(h);}
const levelOf=f=>f.direction==='down'?f.height+(f.kind==='floor'?(f.thickness>0?f.thickness:150):(f.beamHeight>0?f.beamHeight:0)):f.height;
const clusters=[];for(const h of levels){const last=clusters.at(-1);if(last&&h-last.at(-1)<=200)last.push(h);else clusters.push([h]);}
const levelValues=clusters.map(c=>Math.max(...c)),groupFor=f=>levelValues.reduce((best,h)=>Math.abs(h-levelOf(f))<Math.abs(best-levelOf(f))?h:best,levelValues[0]),keyFor=f=>'level-'+groupFor(f).toFixed(3),layerFor=f=>'SW-'+groupFor(f).toFixed(3);

 const floorInput={storyHeight:opt.storyHeight,source:indexes.floor.source,index:indexes.floor.index,rules:{geometry:'SW原生面优先，二维仅辅助'},floors,overlapGroups:[]};
 for(const f of selected.filter(f=>f.direction==='down'&&f.kind==='floor')){
  const key=keyFor(f),region=[{polygon:f.polygon,holes:f.holes||[]}],thickness=f.thickness>0?f.thickness:150,box=bounds(f.polygon);
  const holes=(f.holes||[]).map((polygon,i)=>{const b=bounds(polygon);return {id:f.id+'/H'+i,polygon,width:b[2]-b[0],length:b[3]-b[1]};});
  floors.push({id:f.id,key,name:f.component+' / '+f.id,memberIds:[f.id],memberBaselineKeys:[f.id],alignmentGroup:f.id,region,holes,thickness,sourceThickness:f.thickness,thicknessDefaulted:!(f.thickness>0),members:[{id:f.id,face:f.id,bottom:f.height,planeNormal:f.planeNormal,planeOrigin:f.planeOrigin,region}],nativeBase:0});floorInput.overlapGroups.push({id:f.id,floors:[f.id],pairs:[]});
 }
 for(const f of selected.filter(f=>f.direction==='down'&&['ordinary','gl'].includes(f.kind))){
  const key=keyFor(f),region=[{polygon:f.polygon,holes:f.holes||[]}];
  const simple=f.hasCurves?[]:beamRoutes(f);
  const split=f.kind==='ordinary'&&(f.hasCurves||simple.length>1)&&f.edges?.length?nativeBeamSegments(f):null;
  const routes=split?.routes.length?split.routes:simple;
  const rebates=f.rebateMembers||[];
  const group={id:f.id,key,region:[...region,...rebates.flatMap(r=>r.region)],sourceFaces:[f.id,...rebates.map(r=>r.faceId)],rebateMembers:rebates,rebateMerged:rebates.length>0,routes:[],pendingParts:[],calculationParts:[]};
  if(!routes.length){pending.push({id:f.id,reason:'原生梁面未得到可靠中心线，需核对真实边界'});continue;}
  for(const [i,edge] of (split?.uncovered||[]).entries()){
   const pts=edge.curvePoints?.length?edge.curvePoints:[edge.start,edge.end];
   const focusBounds=bounds(pts);
   pending.push({id:f.id+'/边界'+(i+1),reason:edge.circleRadius?'此圆弧边未找到可靠的同心配对段':'此曲边缺少可计算的原生圆弧证据',focusBounds});
  }
  for(let i=0;i<routes.length;i++){
   const original=routes[i],id=f.id+(original.ends?'/N':'/R')+(i+1),result=applyRouteReview(f,original,id,reviews);
   let r=result.route;
   const review=result.review,wn=!review?original.wnRule:null;
   if(wn?.offset){
    const u=mul(sub(r.end,r.start),1/r.length),sign=wn.yangSide==='left'?1:-1,delta=mul([-u[1],u[0]],sign*(r.width/2-wn.offset));
    const start=add(r.start,delta),end=add(r.end,delta);
    r={...r,start,end,path:{...r.path,start,end}};
   }
   const height=review?.height>0?review.height:f.beamHeight>0?f.beamHeight:Math.ceil((f.height+.01)/opt.storyHeight)*opt.storyHeight-f.height;
   const auto=f.autoRoutes?.find(a=>len(sub(a.start,original.start))<.1&&len(sub(a.end,original.end))<.1);
   const ends=['start','end'].map((side,k)=>{
    const chosen=review?.[side+'Type'];
    if(['yin','yang'].includes(chosen))return {type:chosen,nativeType:original.ends?.[k]?.nativeType,reason:'人工核算确认'};
    if(original.ends)return original.ends[k];
    return {type:['yin','yang'].includes(f[side+'Type'])?f[side+'Type']:auto?.[side+'Type']||'unknown',reason:auto?.[side+'Reason']||'原生阴阳端'};
   });
   const issues=[...result.issues];
   if(ends.some(e=>!['yin','yang'].includes(e.type)))issues.push('本分段阴阳端或连接证据待核对');
   if(routes.length>1&&!original.ends&&!review)issues.push('多路线／变宽面需逐段确认阴阳边与WN分割，当前面级首末端不能代替逐边证据');
   if(!(height>0)||(!(f.beamHeight>0)&&!(review?.height>0)))issues.push('尚未确认楼层标高到主梁底的查表梁高，不按坐标原点推测');
   const b={start:r.start,end:r.end,length:r.length,path:r.path,reviewStart:original.start,reviewEnd:original.end,curveSegment:r.path.type==='arc',nativeSegment:!!original.ends,sideEvidence:original.sides?.map(e=>({type:e.type,start:e.start,end:e.end})),wnRule:wn,id,key,groupId:f.id,memberIds:[f.id,...rebates.map(r=>r.faceId)],sourceFace:f.id,rebateMembers:rebates,planeNormal:f.planeNormal,planeOrigin:f.planeOrigin,bottom:f.height,top:f.height+height,height,thickness:review?.thickness>0?review.thickness:f.thickness>0?f.thickness:null,gw:review?.width>0?review.width:r.width,width:review?.width>0?review.width:r.width,region,ends,issues,manualReview:review,calculationExempt:!result.issues.length&&!!(review?.exempt||wn?.exempt),exemptionReason:review?.reason||(wn?.exempt?'原生阴线分出窄段 WN≤200mm 免放':undefined),layer:layerFor(f)};
   if(f.diagonalConfirmed||review?.diagonalConfirmed)b.reviewBaseline={origin:r.start,angleDeg:Math.atan2(r.end[1]-r.start[1],r.end[0]-r.start[0])*180/Math.PI,confirmed:true};
   (f.kind==='gl'?gl:beams).push(b);group.routes.push(id);
  }groups.push(group);sources.push({id:f.id,key,groupId:f.id,memberIds:[f.id],sourceFace:f.id,planeNormal:f.planeNormal,planeOrigin:f.planeOrigin,bottom:f.height,region});
 }
 // An unreviewed overlap must never leave duplicate slab/beam support regions.
 for(const f of floors)for(const b of [...beams,...gl])if(Math.abs(f.members[0].bottom-b.bottom)<.05&&[b.start,b.end,mul(add(b.start,b.end),.5)].some(p=>regionContains(p,f.region)&&f.region.every(r=>ringDistance(p,r.polygon)>.05))){pending.push({id:f.id,reason:'楼面与实际梁区重合，需先复核分面／导入已分割计算包；未同时覆盖计算'});f.thickness=-1;}
 const floats=Float32Array.from((scan.meshTriangles||[]).flatMap(t=>t.flatMap(p=>[p[0],p[2],-p[1]])));
 const plans=levelValues.map((h,i)=>{const key='level-'+h.toFixed(3),faces=scan.faces.filter(f=>f.direction==='up'&&keyFor(f)===key),zones=selected.filter(f=>keyFor(f)===key).map(f=>({id:f.id,kind:f.kind==='receiver'?'slab':f.kind==='floor'?'slab':f.kind==='ordinary'?'beam':f.kind,top:f.height,bottom:f.height,planeNormal:f.planeNormal,planeOrigin:f.planeOrigin,region:[{polygon:f.polygon,holes:f.holes||[]}]}));return {key,base:0,level:h,zones,meshes:i===0?[{id:'assembly-native',positions:Buffer.from(floats.buffer).toString('base64')}]:[],faces:faces.map(f=>({id:f.id,triangles:f.triangles,planeNormal:f.planeNormal,planeOrigin:f.planeOrigin,region:[{polygon:f.polygon,holes:f.holes||[]}]}))};});
 const data={instances:plans.map((p,i)=>({id:'SW-'+p.level.toFixed(3),label:'原生标高组 '+p.level,key:p.key,order:i+1,offset:0})),plans:plans.map(({faces,...p})=>p)},landingInput={plans:Object.fromEntries(plans.map(p=>[p.key,{faces:p.faces}]))};
 const beamBase={storyHeight:opt.storyHeight,index:indexes.beam.index,source:indexes.beam.source,rules:{},coverage:[],rebateEvidence:[],caseMatchAudit:[]};
 return {nativeFaces:scan.faces,data,floorInput,beamInput:{...beamBase,beams:gl},ordinaryInput:{...beamBase,beams,groups,sources},landingInput,settings:{global:{origin:opt.origin,angleDeg:opt.angleDeg},locals:{},revision:1},pending};
}

