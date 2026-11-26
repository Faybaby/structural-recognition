import {beamPoint,beamSourceAt} from './ordinary-core.js';
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<.05;
// Search original legal alternatives jointly; a split or unlike spacing is not
// permission to move a junction, change XX, or invent a support.
export function alignVerticalBeams(result,optionsFor){
 const audits=[],selected=new Map(),pairs=[],bs=result.beams.filter(b=>b.status==='passed'&&!b.calculationExempt&&b.path.type==='line');
 const options=new Map(bs.map(b=>[b.id,[{id:b.id,nodes:b.nodes,segments:b.segments},...optionsFor(b)]]));
 for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){
  const a=bs[i],b=bs[j];if(a.key===b.key)continue;
  const u=a.path.end.map((v,k)=>(v-a.path.start[k])/a.path.length),v=b.path.end.map((v,k)=>(v-b.path.start[k])/b.path.length);
  if(Math.abs(u[0]*v[1]-u[1]*v[0])>1e-6)continue;
  const offset=Math.abs((b.path.start[0]-a.path.start[0])*u[1]-(b.path.start[1]-a.path.start[1])*u[0]);
  const at=q=>(q[0]-a.path.start[0])*u[0]+(q[1]-a.path.start[1])*u[1],lo=Math.max(0,Math.min(at(b.path.start),at(b.path.end))),hi=Math.min(a.length,Math.max(at(b.path.start),at(b.path.end)));
  if(hi-lo<200)continue;
  if(offset>.05){const middle=beamPoint(a.path,(lo+hi)/2);if(beamSourceAt(b,middle))audits.push({kind:'ordinary',a:a.id,b:b.id,status:'pending',reason:'上下梁实际范围重合但中心线不同；宽度方向居中规则内没有同一中心位置，未横移梁中心线'});continue;}
  const common=n=>at(n.world)>lo+.05&&at(n.world)<hi-.05&&beamSourceAt(a,n.world)&&beamSourceAt(b,n.world),compare=(aa,bb)=>{const x=aa.nodes.filter(common),y=bb.nodes.filter(common);return {x,y,missing:x.filter(p=>!y.some(q=>near(p.world,q.world))).concat(y.filter(p=>!x.some(q=>near(p.world,q.world))))};};
  pairs.push({a,b,compare,lo,hi});
 }
 const locked=[];
 for(const pair of pairs){const {a,b,compare}=pair,aa=selected.get(a.id)||a,bb=selected.get(b.id)||b,initial=compare(aa,bb);let best=null;
  for(const x of options.get(a.id))for(const y of options.get(b.id)){
   const check=compare(x,y);if(check.missing.length||!check.x.length)continue;
   if(locked.some(p=>{const l=p.a.id===a.id?x:p.a.id===b.id?y:selected.get(p.a.id)||p.a,r=p.b.id===a.id?x:p.b.id===b.id?y:selected.get(p.b.id)||p.b;return p.compare(l,r).missing.length;}))continue;
   const distance=(v,orig)=>v.nodes.reduce((s,n)=>s+Math.hypot(...n.world.map((q,k)=>q-orig.nodes.find(o=>o.id===n.id).world[k])),0),score=distance(x,a)+distance(y,b);
   if(!best||score<best.score)best={x,y,score,count:check.x.length};
  }
  if(best){selected.set(a.id,best.x);selected.set(b.id,best.y);locked.push(pair);audits.push({kind:'ordinary',a:a.id,b:b.id,status:'aligned',count:best.count,originalMismatch:initial.missing.length,reason:'同一位置同时通过两层固定XX、阴阳端、50mm模数及真实梁面检查'});}
  else audits.push({kind:'ordinary',a:a.id,b:b.id,status:'pending',originalMismatch:initial.missing.length,reason:'原固定间距／端距／锁定交点内未找到两层共同点位；保留原结果，未强制移动'});
 }
 return {selected,audits};
}
