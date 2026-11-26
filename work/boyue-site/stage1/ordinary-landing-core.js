import {regionContains} from './floor-core.js';
import {triangleHeight} from './landing-core.js';
// Only the broad-phase bounds use native-ray tolerance; barycentric interpolation is unchanged.
const EPS=.005;
export function calculateOrdinaryLandings(result,data,input){
 const plans=Object.fromEntries(data.plans.map(p=>[p.key,p]));
 const surfaces=Object.fromEntries(Object.entries(input.plans).map(([key,p])=>[key,p.faces.flatMap(f=>f.triangles.map(t=>({face:f.id,t,box:[Math.min(...t.map(q=>q[0])),Math.min(...t.map(q=>q[1])),Math.max(...t.map(q=>q[0])),Math.max(...t.map(q=>q[1]))]})))]));
 const points=[];
 for(const instance of data.instances){const plan=plans[instance.key];
  for(const floor of result.floors.filter(f=>f.key===instance.key&&f.status==='passed'))for(const n of floor.nodes){
   const start=n.sourceHeight-plan.base+instance.offset,[x,y]=n.world;let best=null;const checks=[];
   // Include a genuine lower surface within the same native model; never invent a ground plane.
   for(const lower of [...data.instances].filter(i=>i.order<=instance.order).sort((a,b)=>b.order-a.order)){
    const lowerPlan=plans[lower.key];let hit=null;
    for(const s of surfaces[lower.key]){if(x<s.box[0]-EPS||x>s.box[2]+EPS||y<s.box[1]-EPS||y>s.box[3]+EPS)continue;const native=triangleHeight(n.world,s.t);if(native===null)continue;const height=native-lowerPlan.base+lower.offset;if(height>=start-.1)continue;if(!hit||height>hit.height)hit={height,native,face:s.face};}
    checks.push({layer:lower.id,status:hit?'hit':'no-surface-below'});
    if(hit&&(!best||hit.height>best.height)){const zone=lowerPlan.zones?.filter(z=>regionContains(n.world,z.region)&&Math.abs(z.top-hit.native)<.5).sort((a,b)=>(a.kind==='slab'?-1:1))[0];best={...hit,layer:lower.id,key:lower.key,order:lower.order,kind:zone?.kind||'native-top',region:zone?.id||null};}
   }
   const length=best?start-best.height:null;
   points.push({id:instance.id+'/'+n.id,layer:instance.id,floorId:floor.id,nodeId:n.id,world:n.world,startHeight:start,sourceFace:n.sourceFace,status:best?(best.kind==='native-top'?'review':'found'):'missing',length,landing:best,crossLayer:best?instance.order-best.order>1:false,layerDifference:best?instance.order-best.order:null,skippedLayers:best?checks.filter(c=>{const i=data.instances.find(i=>i.id===c.layer);return i.order<instance.order&&i.order>best.order&&c.status!=='hit';}).map(c=>c.layer):[],checks,rule:'从固顶承托位置竖直向下，与已载入原生顶面求最近实际交点；中间层洞口继续向下；无交点不估算',lengthMeaning:'几何竖向距离，未扣除固顶及底座构造尺寸'});
  }
 }
 return {points,summary:{total:points.length,found:points.filter(p=>p.status==='found').length,missing:points.filter(p=>p.status==='missing').length,review:points.filter(p=>p.status==='review').length,crossLayer:points.filter(p=>p.crossLayer).length},geometrySource:input.source};
}
