export const edgeTypeLabel=type=>({yang:'阳线',yin:'阴线',coplanar:'共面接缝',pending:'待核实'}[type]||'待核实');
export const edgeTypeColor=type=>({yang:'#d76b14',yin:'#7f3aa0',coplanar:'#6d7c79',pending:'#b33535'}[type]||'#b33535');
export function groupEdgeLabels(evidence,id){return evidence.groups.find(g=>g.id===id)?.boundaryEdges||[];}
export function beamSideEdges(beam,edges){
 if(beam.path.type!=='line')return [];
 const u=beam.path.end.map((v,i)=>(v-beam.path.start[i])/beam.length),normal=[-u[1],u[0]],mid=beam.path.start.map((v,i)=>(v+beam.path.end[i])/2);
 return [1,-1].map(sign=>{const p=mid.map((v,i)=>v+sign*normal[i]*beam.gw/2),candidates=[];for(const e of edges){const v=e.end.map((q,i)=>q-e.start[i]),l=Math.hypot(...v);if(!l||Math.abs((v[0]*u[0]+v[1]*u[1])/l)<.995)continue;const t=Math.max(0,Math.min(1,((p[0]-e.start[0])*v[0]+(p[1]-e.start[1])*v[1])/(l*l))),q=e.start.map((x,i)=>x+t*v[i]),distance=Math.hypot(p[0]-q[0],p[1]-q[1]);if(distance<2)candidates.push({edge:e,distance});}candidates.sort((a,b)=>a.distance-b.distance);return {sign,edge:candidates[0]?.edge||null,label:candidates[0]?edgeTypeLabel(candidates[0].edge.type):'待核实',type:candidates[0]?.edge.type||'pending'};});
}
