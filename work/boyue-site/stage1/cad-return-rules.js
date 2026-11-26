// Rules confirmed in the returned 3F CAD on 2026-11-18.
export function layoutStairBeam({length,originProjection=0}){
 const snap=t=>Math.round((t+originProjection)/50)*50-originProjection,values=[snap(length/2)],queue=[[0,values[0]],[values[0],length]];
 if(values[0]<=0||values[0]>=length)return {status:'pending',nodes:[],reasons:['楼梯梁居中位置无有效50mm模数点']};
 while(queue.length){const [a,b]=queue.shift();if(b-a<=1300+1e-5)continue;const t=snap((a+b)/2);if(t<=a||t>=b)return {status:'pending',nodes:[],reasons:['楼梯梁补点未收敛']};values.push(t);queue.push([a,t],[t,b]);}
 values.sort((a,b)=>a-b);return {status:'passed',nodes:values.map(t=>({t,origin:'楼梯梁居中补点'})),reasons:[],gtt:length,anchors:[0,length],endOffsets:[null,null],h:[values[0],length-values.at(-1)],spacing:1300,stairRule:true,actualGaps:values.slice(1).map((v,i)=>v-values[i]),mode:'楼梯整梁优先居中；端距≤1300不补，＞1300在该段居中补点'};
}
// Several pairwise intersections may describe one finite-width native joint.
// Keep a real orthogonal intersection as representative; never average points.
export function deduplicateJunctions(junctions,axes,station,tangent){
 const byId=new Map(axes.map(b=>[b.id,b])),clusters=[];
 for(const j of junctions.filter(j=>j.status==='placed')){
  const widths=j.beamIds.map(id=>byId.get(id)?.gw||0),tol=Math.min(...widths)/2;
  const candidates=clusters.filter(c=>c.key===j.key&&c.members.some(q=>q.beamIds.some(id=>j.beamIds.includes(id)))&&Math.hypot(c.point[0]-j.point[0],c.point[1]-j.point[1])<=Math.min(c.tol,tol)+.05);
  const c=candidates[0];if(c){c.members.push(j);c.tol=Math.min(c.tol,tol);}else clusters.push({key:j.key,point:j.point,tol,members:[j]});
 }
 for(const c of clusters){if(c.members.length<2)continue;
  const score=j=>{const [a,b]=j.beamIds.map(id=>byId.get(id));const u=tangent(a.path,j.stations[0]),v=tangent(b.path,j.stations[1]);return Math.abs(u[0]*v[0]+u[1]*v[1]);};
  const rep=[...c.members].sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id))[0],ids=c.members.map(j=>j.id);
  for(const j of c.members){j.originalIntersection=[...j.point];j.point=[...rep.point];j.stations=j.beamIds.map(id=>station(byId.get(id).path,j.point));j.jointCluster={representative:rep.id,members:ids,rule:'同一实体接头多个中心线交点去重，保留真实正交交点；不取平均坐标'};j.reason+='；同一接头采用'+rep.id+'去重';}
 }
 for(const b of axes)b.junctions=b.junctions.map(old=>({...old,...junctions.find(j=>j.id===old.id),t:junctions.find(j=>j.id===old.id)?.stations[junctions.find(j=>j.id===old.id).beamIds.indexOf(b.id)]??old.t}));
}
