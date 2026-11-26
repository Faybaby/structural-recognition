import {alignVerticalBeams} from './rack-vertical.js';
import {regionContains,ringDistance} from './floor-core.js';
import {toBaseline,fromBaseline} from './baseline-core.js';
import {beamPoint,beamSourceAt} from './ordinary-core.js';
const EPS=.05,mod=(v,s)=>(v%s+s)%s,round=v=>Math.round(v*1000)/1000;
const pointKey=p=>p.map(round).join('/');
const bounds=region=>{const p=region.flatMap(r=>r.polygon);return [Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];};
const axes=(lo,hi,pitch,phase,margin=0)=>{const a=[];for(let k=Math.ceil((lo+margin-phase)/pitch);k*pitch+phase<=hi-margin+EPS;k++)a.push(round(k*pitch+phase));return a;};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function footprint(row){
 const path=row.path||{type:'line',start:row.start,end:row.end,length:row.length};
 if(path.type!=='line')return row.matchedRegion?.length?row.matchedRegion:row.region||[];
 const [a,b]=[path.start,path.end],l=distance(a,b),w=(row.gw||row.width||100)/2;
 if(!l)return [];
 const n=[-(b[1]-a[1])*w/l,(b[0]-a[0])*w/l];
 return [{polygon:[[a[0]+n[0],a[1]+n[1]],[b[0]+n[0],b[1]+n[1]],[b[0]-n[0],b[1]-n[1]],[a[0]-n[0],a[1]-n[1]]],holes:[]}];
}
function adjacent(a,b){
 const x=a.box,y=b.box;if(Math.hypot(Math.max(0,x[0]-y[2],y[0]-x[2]),Math.max(0,x[1]-y[3],y[1]-x[3]))>75)return false;
 for(const [r,s] of [[a.region,b.region],[b.region,a.region]])for(const part of r){const step=Math.max(1,Math.floor(part.polygon.length/80));for(let i=0;i<part.polygon.length;i+=step){const p=part.polygon[i];if(regionContains(p,s)||s.some(q=>ringDistance(p,q.polygon)<=75))return true;}}
 return false;
}
function descriptors(sources,input,data){
 const result=[];
 for(const f of input.floors){const row=sources.floor.floors.find(r=>r.id===f.id);if(row&&f.region?.length)result.push({kind:'floor',id:f.id,key:f.key,row,source:f,region:f.region});}
 for(const kind of ['gl','ordinary'])for(const row of sources[kind].beams){if(row.calculationExempt||!row.length||!(row.path||row.start&&row.end))continue;const region=footprint(row);if(region.length)result.push({kind,id:row.id,key:row.key,row,source:row,region});}
 const expanded=result.flatMap(d=>data.instances.filter(i=>i.key===d.key).map(instance=>({...d,instance,layer:instance.id})));
 for(const d of expanded){d.token=d.kind+'|'+d.layer+'|'+d.id;d.box=bounds(d.region);}
 return expanded;
}
function affectedComponents(ds,original,threshold){
 const high=original.filter(p=>Number.isFinite(p.length)&&p.length>threshold),seeds=new Set(high.map(p=>p.kind+'|'+p.layer+'|'+p.owner)),selected=new Set(ds.filter(d=>seeds.has(d.token))),cache=new Map();
 for(const d of ds){d.triggerUids=high.filter(p=>p.kind===d.kind&&p.layer===d.layer&&p.owner===d.id).map(p=>p.uid);d.role=d.triggerUids.length?'core':'neighbor';}
 const near=(a,b)=>{if(a.layer!==b.layer)return false;const k=[a.token,b.token].sort().join('~');if(!cache.has(k))cache.set(k,adjacent(a,b));return cache.get(k);};
 // Full seed faces -> touching beams/floors -> the floors across those beams ->
 // the perimeter beams of those floors. Expansion is bounded, not recursive.
 for(let pass=0;pass<3;pass++){const frontier=[...selected];for(const d of ds)if(!selected.has(d)&&frontier.some(a=>near(a,d)))selected.add(d);}
 const components=[],seen=new Set();for(const d of selected){if(seen.has(d))continue;const members=[],queue=[d];seen.add(d);while(queue.length){const a=queue.pop();members.push(a);for(const b of selected)if(!seen.has(b)&&near(a,b)){seen.add(b);queue.push(b);}}const triggers=members.flatMap(m=>m.triggerUids);for(const m of members)m.linkedTriggerUids=m.triggerUids.length?m.triggerUids:triggers;components.push(members);}
 return components;
}
function choosePhase(ds,base,pitch){
 const boxes=ds.filter(d=>d.kind==='floor').map(d=>bounds(d.region.map(r=>({polygon:r.polygon.map(p=>toBaseline(p,base)),holes:[]}))));
 const lines=ds.filter(d=>d.kind!=='floor'&&(d.row.path?.type||'line')==='line').map(d=>{const p=d.row.path||d.row;return [toBaseline(p.start,base),toBaseline(p.end,base)];});
 return [0,1].map(axis=>{let best=null;for(let phase=0;phase<pitch;phase+=50){let missing=0,balance=0,alignment=0,count=0;for(const b of boxes){const lo=b[axis],hi=b[axis+2];if(hi-lo<pitch-100)continue;const a=axes(lo,hi,pitch,phase,500),expected=Math.min(2,Math.max(1,Math.floor((hi-lo-1000)/pitch)+1));missing+=Math.max(0,expected-a.length);if(a.length){balance+=(a[0]-lo-(hi-a.at(-1)))**2;count+=a.length;}}
  for(const [a,b] of lines)if(Math.abs(a[axis]-b[axis])<EPS){const gap=mod(a[axis]-phase,pitch),near=Math.min(gap,pitch-gap);alignment+=near< EPS?0:Math.min(near,Math.abs(near-300),Math.abs(near-600));}
  const score=[missing,alignment,Math.round(balance/1000),count,phase];if(!best||score.some((v,i)=>v<best.score[i]&&score.slice(0,i).every((q,j)=>q===best.score[j])))best={phase,score};}return best.phase;});
}
function sourceFloor(d,world){return d.source.members.filter(m=>regionContains(world,m.region)).sort((a,b)=>a.bottom-b.bottom)[0];}
function floorNodes(d,base,pitch,phase){
 const region=d.region.map(r=>({polygon:r.polygon.map(p=>toBaseline(p,base)),holes:r.holes.map(h=>h.map(p=>toBaseline(p,base)))})),box=bounds(region),nodes=[],notes=[];
 if(Math.min(box[2]-box[0],box[3]-box[1])<pitch-100)return {nodes,notes:['窄面按本次统一间距减100的阈值免放'],exempt:true};
 for(const u of axes(box[0],box[2],pitch,phase[0],500))for(const v of axes(box[1],box[3],pitch,phase[1],500)){
  const world=fromBaseline([u,v],base);if(!regionContains(world,d.region))continue;
  if(d.region.some(r=>r.holes.some(h=>ringDistance(world,h)<150-EPS)))continue;
  if(!d.region.some(r=>regionContains(world,[r])&&ringDistance(world,r.polygon)>=500-EPS))continue;
  const s=sourceFloor(d,world);if(s)nodes.push({world,u,v,sourceFace:s.face,sourceRegion:s.id,sourceHeight:s.bottom,origin:'统一网格',uniformGrid:true});
 }
 // Hole-perimeter exceptions remain explicit and never masquerade as pitch rows.
 for(const old of d.row.nodes.filter(n=>n.origin==='洞周外围'))if(regionContains(old.world,d.region)&&!nodes.some(n=>distance(n.world,old.world)<EPS))nodes.push({...old,id:undefined,uniformGrid:false,uniformException:'洞周避让例外保留'});
 if(!nodes.length)notes.push('当前统一相位与500mm普通边距／洞口避让无可用交点，未强行放置');
 return {nodes,notes};
}
function beamNodes(d,base,pitch,phase){
 const b=d.row,path=b.path||{type:'line',start:b.start,end:b.end,length:b.length},nodes=[],notes=[],length=b.length;
 const add=(t,origin,exception)=>{if(t<0||t>length)return;const world=beamPoint(path,t),s=beamSourceAt(b,world);if(!s||nodes.some(n=>distance(n.world,world)<EPS))return;nodes.push({t,world,sourceFace:s.sourceFace||s.face||b.sourceFace,sourceRegion:s.id||b.id,sourceHeight:s.bottom,origin,uniformGrid:!exception,uniformException:exception||(toBaseline(world,base).some(v=>Math.abs(v/50-Math.round(v/50))>1e-6)?'梁横向按实际中心线，存在非50mm坐标例外':undefined)});};
 // Physical yang ends and real shared intersections are retained, not shifted to
 // manufacture a rectangular frame. No old table XX limits the new interior grid.
 for(const n of b.nodes)if(n.origin==='阳线端部'||n.origin==='梁梁交点')add(n.t,n.origin,'实体端部／交点保留');
 for(let side=0;side<2;side++)if(b.ends?.[side]?.type==='yang'&&!nodes.some(n=>n.origin==='阳线端部'&&(side===0?n.t<150:length-n.t<150))){const offset=(b.gw||b.width)>150?50:100,projection=b.originProjection||0,t=side?Math.floor((projection+length-offset)/50)*50-projection:Math.ceil((projection+offset)/50)*50-projection;add(t,'阳线端部','实体阳端保留');}
 if(path.type==='line'){
  const a=toBaseline(path.start,base),z=toBaseline(path.end,base),axis=Math.abs(a[0]-z[0])<EPS?1:Math.abs(a[1]-z[1])<EPS?0:null;
  if(axis!==null){const lo=Math.min(a[axis],z[axis]),hi=Math.max(a[axis],z[axis]);for(const at of axes(lo,hi,pitch,phase[axis],50))add((at-a[axis])/(z[axis]-a[axis])*length,'统一网格');}
  else{for(let t=50;t<length-50;t+=pitch)add(t,'统一轴向网格','斜梁保留真实中心线及独立方向');notes.push('斜梁沿实际中心线按统一值布点，不强行横移到正交网格');}
 }else{for(let t=50;t<length-50;t+=pitch)add(t,'统一弧长网格','圆弧／组合路线按实际弧长');notes.push('圆弧／组合梁按实际中心线弧长布置，曲线段不强制形成直角井字');}
 if(!nodes.length&&length>=pitch){const t=Math.round(((b.originProjection||0)+length/2)/50)*50-(b.originProjection||0);add(t,'统一短段居中','共同网格未命中短段，按50mm模数居中收口');}
 if(!nodes.length&&length<pitch){notes.push('梁段短于统一间距且无需保留的阳端／交点，不补中间点');return {nodes,notes,exempt:true};}
 return {nodes:nodes.sort((a,b)=>a.t-b.t),notes};
}
export function uniformEdgeCandidates(valid,pitch){
 const pairs=new Map();for(const axis of [0,1]){const rows=new Map();for(const p of valid.filter(p=>p.uniformAffected))for(const z of p.levels){const key=round(p.uv[1-axis])+'/'+round(z);if(!rows.has(key))rows.set(key,[]);rows.get(key).push(p);}
  for(const row of rows.values()){row.sort((a,b)=>a.uv[axis]-b.uv[axis]);for(let i=0;i<row.length;i++){let next=i+1;while(next<row.length&&Math.abs(row[next].uv[axis]-row[i].uv[axis])<EPS)next++;if(next===row.length)continue;const at=row[next].uv[axis],gap=at-row[i].uv[axis];if(gap>pitch+EPS)continue;for(let j=next;j<row.length&&Math.abs(row[j].uv[axis]-at)<EPS;j++){const a=row[i],b=row[j],key=[a.uid,b.uid].sort().join('~');pairs.set(key,{a,b,size:round(gap),axis});}}}
 }return [...pairs.values()];
}
export function calculateUniformRack({sources,data,floorInput,settings,config,geometry,originalRecords,buildGraph},progress){
 const base=settings.global,pitch=config.primary,original=new Map(originalRecords.map(p=>[p.uid,p])),aligned=structuredClone(sources),ds=descriptors(sources,floorInput,data),components=affectedComponents(ds,originalRecords,config.threshold),target=new Set(components.flat().map(d=>d.token)),cache=new Map(),uniformAudit=[],uniformRegions=[];
 for(const kind of ['floor','gl','ordinary']){const field=kind==='floor'?'floors':'beams';aligned[kind][field]=aligned[kind][field].flatMap(row=>data.instances.filter(i=>i.key===row.key).map(i=>({...structuredClone(row),layer:i.id,layoutId:kind+'|'+i.id+'|'+row.id,nodes:row.nodes.map(n=>({...n,layer:i.id}))})));aligned[kind].layoutScope='per-layer';}
 let records=originalRecords.filter(p=>!target.has(p.kind+'|'+p.layer+'|'+p.owner)),created=0,attempts=0;
 for(let ci=0;ci<components.length;ci++){
  const component=components[ci],phase=choosePhase(component,base,pitch);progress({stage:'统一间距及周边梁板',done:ci,total:components.length});
  for(const d of component){
   const generated=d.kind==='floor'?floorNodes(d,base,pitch,phase):beamNodes(d,base,pitch,phase),oldNodes=d.row.nodes.filter(n=>originalRecords.some(p=>p.kind===d.kind&&p.owner===d.id&&p.layer===d.layer&&p.nodeId===n.id)),used=new Set();
   // Exact survivors keep their identifiers before the remaining nodes are paired.
   for(const n of generated.nodes){const old=oldNodes.find(o=>!used.has(o.id)&&distance(o.world,n.world)<EPS);if(old){n.id=old.id;used.add(old.id);}}
   for(const n of generated.nodes)if(!n.id){const old=oldNodes.filter(o=>!used.has(o.id)).sort((a,b)=>distance(a.world,n.world)-distance(b.world,n.world))[0];if(old&&distance(old.world,n.world)<=pitch){n.id=old.id;used.add(old.id);}else n.id=d.id+'-U'+String(++created).padStart(5,'0');}
   for(const instance of [d.instance])for(const n of generated.nodes){
    const plan=data.plans.find(p=>p.key===instance.key),uid=d.kind+'|'+instance.id+'/'+n.id,prior=original.get(uid),top=n.sourceHeight-plan.base+instance.offset,landing=geometry.landing(n.world,top,instance);let h=0;
    const p={uid,id:instance.id+'/'+n.id,kind:d.kind,owner:d.id,key:d.key,layer:instance.id,nodeId:n.id,world:n.world,uv:toBaseline(n.world,base),sourceFace:n.sourceFace,sourceHeight:n.sourceHeight,top,bottom:landing?.height??null,length:landing?top-landing.height:null,status:landing?(landing.kind==='native-top'?'review':'found'):'missing',landing,crossLayer:landing?instance.order-landing.order>1:false,origin:n.origin,uniformAffected:true,uniformGrid:n.uniformGrid,uniformException:n.uniformException,uniformComponent:ci+1,uniformRole:d.role,triggerUids:d.linkedTriggerUids,originalRecord:prior?.originalRecord||{id:instance.id+'/'+n.id,nodeId:n.id,floorId:d.id,key:d.key,layer:instance.id}};
    p.high=p.length>config.threshold;p.levels=p.bottom==null?[]:config.steps.map(s=>h+=s).map(z=>p.bottom+z).filter(z=>z<p.top-EPS);records.push(p);
   }
   const row=(d.kind==='floor'?aligned.floor.floors:aligned[d.kind].beams).find(r=>r.id===d.id&&r.layer===d.layer),oldIndex=row.index;
   const oldFields=['x','y','h','phase','commonPhase','holeChecks','rowChecks','columnChecks','coverage','splitParts','partitionGuides','omittedInsideHoles','connectedHole','layout','notes','gridSegments','cells','mode','segments','actualGaps','gtt','anchors','endOffsets','longRule','spacing'];row.originalLayout={index:oldIndex,base:row.base};for(const field of oldFields)if(field in row){row.originalLayout[field]=row[field];delete row[field];}
   row.base=structuredClone(base);row.baselineScope='统一区域共同基准';row.baselineSource='统一区域共同基准';row.uniformLayout={pitch,phase,formula:{x:'X′='+phase[0]+'+k*'+pitch,y:'Y′='+phase[1]+'+m*'+pitch},gridNodeIds:generated.nodes.filter(n=>n.uniformGrid).map(n=>n.id),exceptions:generated.nodes.filter(n=>n.uniformException).map(n=>({id:n.id,reason:n.uniformException})),actualGaps:d.kind==='floor'?null:generated.nodes.slice(1).map((n,i)=>round(n.t-generated.nodes[i].t)),ordinaryFloorMinimumEdgeMm:d.kind==='floor'?500:null};row.calculationPipeline=['原三维区域与真实阴阳边','用户统一间距','共同相位及边界例外','源面与承接面复核','杆件标高及干涉复核'];row.mode='用户统一间距 '+pitch+'mm；原表规则仅在originalLayout中作对照';row.nodes=generated.nodes.map(n=>({...n,layer:d.layer}));row.index=d.kind==='floor'?{sx:pitch,sy:pitch,source:'user-uniform',originalIndex:oldIndex}:{spacing:pitch,source:'user-uniform',originalIndex:oldIndex};row.gdModel=null;row.uniformAlignment=true;row.uniformPhase=phase;row.endDistances=null;row.status=generated.exempt?'exempt':generated.nodes.length?'passed':'pending';row.reasons=generated.notes;row.gridSegments=[];
   uniformAudit.push({kind:d.kind,id:d.id,key:d.key,layer:d.layer,token:d.token,role:d.role,triggerUids:d.linkedTriggerUids,ownTriggerUids:d.triggerUids,originalCount:originalRecords.filter(p=>p.kind===d.kind&&p.owner===d.id&&p.layer===d.layer).length,originalMaxLength:Math.max(0,...originalRecords.filter(p=>p.kind===d.kind&&p.owner===d.id&&p.layer===d.layer).map(p=>p.length||0)),component:ci+1,phase,pitch,originalIndex:oldIndex,status:row.status,count:row.nodes.length,exceptions:row.nodes.filter(n=>n.uniformException).length,reason:generated.notes.join('；')||'主体网格统一按用户输入值；原间距表不参与本次区域求解'});
   uniformRegions.push({kind:d.kind,id:d.id,key:d.key,layer:d.layer,role:d.role,triggerUids:d.linkedTriggerUids,component:ci+1,phase,memberIds:d.row.memberIds,region:d.region,members:d.kind==='floor'?d.source.members:[],path:d.kind!=='floor'?(d.row.path||{type:'line',start:d.row.start,end:d.row.end,length:d.row.length}):null,bottom:d.row.bottom});attempts++;
  }
 }
 // Coincident physical heads are shared by adjacent logical beam routes.
 const physical=new Map();records=records.filter(p=>{if(!p.uniformAffected)return true;const key=p.layer+'/'+pointKey(p.world)+'/'+round(p.top);const old=physical.get(key);if(!old){physical.set(key,p);return true;}old.sharedOwners=[...new Set([...(old.sharedOwners||[old.owner]),p.owner])];return false;});
 // Do not turn very short boundary residuals into intersecting physical poles,
 // base plates or rosettes. Keep the logical positions visible for review.
 const formal=records.filter(p=>p.uniformAffected&&p.status==='found');
 for(let i=0;i<formal.length;i++)for(let j=i+1;j<formal.length;j++){const a=formal[i],b=formal[j],gap=distance(a.world,b.world),overlap=Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom);if(overlap<=.1)continue;const body=gap<config.diameter-EPS,plates=Math.abs(a.bottom-b.bottom)<6&&Math.abs(a.world[0]-b.world[0])<120-EPS&&Math.abs(a.world[1]-b.world[1])<120-EPS,rosettes=gap<120-EPS&&a.levels.some(z=>b.levels.some(w=>Math.abs(z-w)<10));if(!body&&!plates&&!rosettes)continue;const reason=body?'立杆管体距离不足':plates?'底座外轮廓重叠':'盘扣节点外轮廓重叠';for(const [p,q] of [[a,b],[b,a]]){p.status='review';p.assemblyConflict={other:q.uid,distance:round(gap),reason};}}
 for(const [kind,result] of Object.entries(aligned)){const list=records.filter(p=>p.kind===kind);result.landings.points=list.map(p=>({...p.originalRecord,world:p.world,startHeight:p.top,landing:p.landing,length:p.length,status:p.status,sourceFace:p.sourceFace,crossLayer:p.crossLayer,checks:p.landing?.checks||[],skippedLayers:p.landing?.skippedLayers||[]}));result.landings.summary={total:list.length,found:list.filter(p=>p.status==='found').length,missing:list.filter(p=>p.status==='missing').length,crossLayer:list.filter(p=>p.crossLayer).length};}
 aligned.floor.summary={...aligned.floor.summary,uniqueModelPoints:aligned.floor.floors.reduce((n,f)=>n+f.nodes.length,0),passed:aligned.floor.floors.filter(f=>f.status==='passed').length,exempt:aligned.floor.floors.filter(f=>f.status==='exempt').length,pending:aligned.floor.floors.filter(f=>f.status==='pending').length};
 aligned.ordinary.points=[...new Map(aligned.ordinary.beams.flatMap(b=>b.nodes.map(n=>[n.layer+'/'+n.id,n]))).values()];aligned.ordinary.landingFloors=aligned.ordinary.beams.filter(b=>b.nodes.length).map(b=>({...b}));
 for(const kind of ['gl','ordinary'])aligned[kind].summary={...aligned[kind].summary,uniqueModelPoints:kind==='ordinary'?aligned.ordinary.points.length:aligned.gl.beams.reduce((n,b)=>n+b.nodes.length,0)};
 for(const kind of ['floor','gl','ordinary']){aligned[kind].uniformSpacing=pitch;aligned[kind].summary.pointScope='per-layer-instances';}
 const graph=buildGraph(records,geometry,config,cache,original),rods=graph.edges.flatMap(e=>e.levels.map(z=>({...e,id:e.id+'@'+z,level:z,custom:Math.abs(e.size-pitch)>EPS}))),changes=records.filter(p=>original.has(p.uid)&&distance(p.world,original.get(p.uid).world)>EPS).map(p=>({id:p.uid,kind:p.kind,owner:p.owner,layer:p.layer,before:original.get(p.uid).world,after:p.world,oldLength:original.get(p.uid).length,newLength:p.length,sourceFace:p.sourceFace,reason:'统一间距'+pitch+'mm重新求解所属区域与周边梁板；实际源面及承接面重新检查'})),added=records.filter(p=>!original.has(p.uid)),removed=originalRecords.filter(p=>!records.some(r=>r.uid===p.uid)).map(p=>({id:p.uid,kind:p.kind,world:p.world,reason:'统一间距方案重布或共享点合并；原方案关闭此模式后恢复'}));
 const highSupports=records.filter(p=>p.high).map(p=>{const es=graph.edges.filter(e=>e.a===p.uid||e.b===p.uid),cells=graph.cells.filter(c=>c.vertices.includes(p.uid));return {...p,state:cells.length?'formed':es.length?'partial':'isolated',cells:cells.map(c=>c.id),connections:es.map(e=>e.id),reason:p.assemblyConflict?p.assemblyConflict.reason+'，未生成正式立杆':p.status!=='found'?'实际承接面缺失或类别待核对，未生成正式立杆':cells.length?'统一间距区域形成闭合井字':es.length?'已有局部连接；边界收口采用实际尺寸':'受洞口、实体或节点标高约束，未强制连接'};});
 const verticalAudit=[];
 if(config.alignVertical)for(const lower of data.instances){const upper=data.instances.find(i=>i.order===lower.order+1);if(!upper)continue;
  const subset=aligned.ordinary.beams.filter(b=>b.layer===lower.id||b.layer===upper.id);verticalAudit.push(...alignVerticalBeams({beams:subset},()=>[]).audits.map(a=>({...a,aLayer:subset.find(b=>b.id===a.a)?.layer,bLayer:subset.find(b=>b.id===a.b)?.layer})));
  for(const group of floorInput.overlapGroups||[])for(const pair of group.pairs||[]){let a=ds.find(d=>d.kind==='floor'&&d.id===pair.a&&d.layer===lower.id),b=ds.find(d=>d.kind==='floor'&&d.id===pair.b&&d.layer===upper.id);if(!a||!b){a=ds.find(d=>d.kind==='floor'&&d.id===pair.b&&d.layer===lower.id);b=ds.find(d=>d.kind==='floor'&&d.id===pair.a&&d.layer===upper.id);}if(!a||!b||!target.has(a.token)&&!target.has(b.token))continue;
   const aa=aligned.floor.floors.find(f=>f.id===a.id&&f.layer===a.layer).nodes,bb=aligned.floor.floors.find(f=>f.id===b.id&&f.layer===b.layer).nodes,missing=aa.filter(n=>regionContains(n.world,b.region)&&!bb.some(m=>distance(n.world,m.world)<EPS)).concat(bb.filter(n=>regionContains(n.world,a.region)&&!aa.some(m=>distance(n.world,m.world)<EPS))),count=aa.filter(n=>bb.some(m=>distance(n.world,m.world)<EPS)).length;verticalAudit.push({kind:'floor',a:a.id,b:b.id,aLayer:a.layer,bLayer:b.layer,status:missing.length?'pending':'aligned',count,reason:missing.length?'实际相邻两层重合区域有'+missing.length+'点未同位，保持分别列出':'实际相邻两层重合区域逐点核对通过'});
  }
 }
 for(const audit of uniformAudit){const owned=records.filter(p=>p.kind===audit.kind&&p.layer===audit.layer&&(p.owner===audit.id||p.sharedOwners?.includes(audit.id))),ids=new Set(owned.map(p=>p.uid));audit.afterPoints=owned.map(p=>({uid:p.uid,world:p.world,sourceFace:p.sourceFace,top:p.top,bottom:p.bottom,length:p.length,status:p.status,exception:p.uniformException}));audit.beforePoints=originalRecords.filter(p=>p.kind===audit.kind&&p.layer===audit.layer&&p.owner===audit.id).map(p=>({uid:p.uid,world:p.world,top:p.top,bottom:p.bottom,length:p.length}));audit.rods=rods.filter(e=>ids.has(e.a)||ids.has(e.b)).length;audit.cells=graph.cells.filter(c=>c.vertices.some(id=>ids.has(id))).length;audit.unconnected=owned.filter(p=>p.length>config.threshold&&!rods.some(e=>e.a===p.uid||e.b===p.uid)).length;audit.connectionStatus=audit.unconnected?'pending':audit.rods?'connected':'unconnected';}
 const triggerAudit=originalRecords.filter(p=>Number.isFinite(p.length)&&p.length>config.threshold).map(p=>{const audit=uniformAudit.find(a=>a.kind===p.kind&&a.layer===p.layer&&a.id===p.owner);return {uid:p.uid,id:p.id,kind:p.kind,owner:p.owner,layer:p.layer,key:p.key,world:p.world,top:p.top,bottom:p.bottom,length:p.length,crossLayer:p.crossLayer,sourceFace:p.sourceFace,status:p.status,landing:p.landing,formula:p.top+' - '+p.bottom+' = '+p.length+' > '+config.threshold,affected:!!audit,afterUids:audit?.afterPoints.map(n=>n.uid)||[],component:audit?.component,phase:audit?.phase,pitch,connectionStatus:audit?.connectionStatus||'pending',rods:audit?.rods||0,cells:audit?.cells||0,reason:audit?'原始承接长度严格大于阈值，按实际所属层的梁板确定核心区':'原始长支撑尚无可用区域几何，保留待核对'};});
 const strip=p=>{const {originalRecord,...r}=p;return r;},sizes=[...new Set(rods.map(e=>e.size))].sort((a,b)=>b-a).map(size=>({size,count:rods.filter(e=>Math.abs(e.size-size)<EPS).length}));
 return {version:3,layoutScope:'per-layer',triggerAudit,config,uniformBase:structuredClone(base),baselineRevision:settings.revision,positionsOnly:true,componentSelection:'deferred-visual-dimensions-only',alignmentMethod:'原始实际支撑长>3200 → 本层梁板核心区 → 同层连接邻区 → 统一间距 → 重新核对源面、承接长度和横杆；其他层不跟随模型类型重布',uniformRegions,uniformAudit,verticalAudit,aligned,positions:records.map(strip),poles:records.filter(p=>p.uniformAffected&&p.status==='found').map(strip),rods,cancelled:graph.cancelled,cells:graph.cells,changes,added:added.map(strip),removed,highSupports:highSupports.map(strip),originalSummary:{cells:0,rods:0},summary:{originalPositions:originalRecords.length,alignedPositions:records.length,addedPoles:added.length,removedPoles:removed.length,moved:changes.length,high:highSupports.length,formed:highSupports.filter(p=>p.state==='formed').length,partial:highSupports.filter(p=>p.state==='partial').length,isolated:highSupports.filter(p=>p.state==='isolated').length,poles:records.filter(p=>p.uniformAffected&&p.status==='found').length,rods:rods.length,cells:graph.cells.length,cancelled:graph.cancelled.length,sizes,attempts,collisionChecks:cache.size,originalRods:0,originalCells:0,affectedRegions:target.size,coreRegions:uniformAudit.filter(a=>a.role==='core').length,neighborRegions:uniformAudit.filter(a=>a.role==='neighbor').length,triggerLines:triggerAudit.length,unchangedLayers:data.instances.filter(i=>!uniformAudit.some(a=>a.layer===i.id)).map(i=>i.id),components:components.length,pendingRegions:uniformAudit.filter(r=>r.status==='pending').length,assemblyConflicts:records.filter(p=>p.assemblyConflict).length,receiverReview:records.filter(p=>p.uniformAffected&&p.status==='review'&&!p.assemblyConflict).length},rules:['统一间距'+pitch+'mm替代选中及周边区域的梁XX和楼面Sx/Sy；原结果不修改','普通楼面点保留500mm最小边距、洞口避让及50mm基准模数；不沿用原索引间距上限','实体阳端、真实交点、洞周点和斜弧梁单独列例外，未冒充统一直角网格','梁点仍位于真实中心线；全部重新求实际源面和承接面，允许增减点','主体网格按输入值；边界连接横杆按实际距离收口并标识定制长度','保留200/1500/1500实际落脚面节点规则；不同标高或实体干涉处不连接']};
}
