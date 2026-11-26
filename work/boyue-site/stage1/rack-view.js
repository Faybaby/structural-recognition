// Display-only selection: a shared pole does not make every attached rod a cell edge.
export const rackPointInScope=(point,scope='all')=>!!point&&(scope==='all'||point.layer===scope);
export function uniformRackView(result,scope='all'){
 const positions=result.positions.filter(p=>p.uniformAffected&&rackPointInScope(p,scope)),uids=new Set(positions.map(p=>p.uid));
 return {uids,positions,poles:result.poles.filter(p=>uids.has(p.uid)),rods:result.rods.filter(e=>uids.has(e.a)&&uids.has(e.b)),cells:result.cells.filter(c=>c.vertices.every(id=>uids.has(id)))};
}
export function formedRackView(result, scope='all') {
 const positions=new Map(result.positions.map(p=>[p.uid,p]));
 const cells=(result.cells||[]).filter(c=>c.vertices.length===4&&c.vertices.every(id=>rackPointInScope(positions.get(id),scope)));
 const uids=new Set(cells.flatMap(c=>c.vertices));
 const rods=result.rods.filter(e=>cells.some(c=>Math.abs(c.level-e.level)<.05&&c.vertices.some((id,i)=>{const next=c.vertices[(i+1)%4];return id===e.a&&next===e.b||id===e.b&&next===e.a;})));
 return {cells,uids,rods,poles:result.poles.filter(p=>uids.has(p.uid))};
}
