const EPS=1e-6;
export function regionBounds(region){const p=region.flatMap(r=>r.polygon);return [Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];}
export function physicalShortSide(region){
 const p=[...new Map(region.flatMap(r=>r.polygon).map(p=>[p.join('/'),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lo=[],hi=[];
 for(const q of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),q)<=EPS)lo.pop();lo.push(q);}for(const q of [...p].reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),q)<=EPS)hi.pop();hi.push(q);}const hull=[...lo.slice(0,-1),...hi.slice(0,-1)];let best=Infinity,short=0;
 for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],angle=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(angle),s=Math.sin(angle),x=hull.map(p=>p[0]*c+p[1]*s),y=hull.map(p=>-p[0]*s+p[1]*c),w=Math.max(...x)-Math.min(...x),h=Math.max(...y)-Math.min(...y);if(w*h<best-EPS){best=w*h;short=Math.min(w,h);}}
 return short;
}
function area(r){return Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-p[1]*q[0];},0))/2;}
function clipRing(r,axis,value,less){const out=[];for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],ia=less?a[axis]<=value+EPS:a[axis]>=value-EPS,ib=less?b[axis]<=value+EPS:b[axis]>=value-EPS;if(ia)out.push(a);if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,j)=>v+(b[j]-v)*t));}}return out;}
function clipRegion(region,axis,value,less){return region.map(r=>({polygon:clipRing(r.polygon,axis,value,less),holes:r.holes.map(h=>clipRing(h,axis,value,less)).filter(h=>h.length>=3&&area(h)>EPS)})).filter(r=>r.polygon.length>=3&&area(r.polygon)>EPS);}
export function splitThroughHole(region,hole){
 if(!hole.box)return null;const b=regionBounds(region),q=hole.box,p=hole.local,bb=[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
 let definitions;
 if(bb[1]-b[1]<=500+EPS&&b[3]-bb[3]<=500+EPS)definitions=[{name:'洞口左侧',axis:0,value:q[0],less:true},{name:'洞口右侧',axis:0,value:q[2],less:false}];
 else if(bb[0]-b[0]<=500+EPS&&b[2]-bb[2]<=500+EPS)definitions=[{name:'洞口下侧',axis:1,value:q[1],less:true},{name:'洞口上侧',axis:1,value:q[3],less:false}];
 else return null;
 return definitions.map(d=>({...d,region:clipRegion(region,d.axis,d.value,d.less)})).filter(d=>d.region.length);
}
export function holeEdgeStrips(region,hole){
 if(!hole.box)return [];const b=regionBounds(region),q=hole.box,p=regionBounds([{polygon:hole.local,holes:[]}]);
 return [
  {name:'洞口左侧窄条',gap:p[0]-b[0],bounds:[b[0],q[1],q[0],q[3]]},
  {name:'洞口右侧窄条',gap:b[2]-p[2],bounds:[q[2],q[1],b[2],q[3]]},
  {name:'洞口下侧窄条',gap:p[1]-b[1],bounds:[q[0],b[1],q[2],q[1]]},
  {name:'洞口上侧窄条',gap:b[3]-p[3],bounds:[q[0],q[3],q[2],b[3]]}
 ].filter(s=>s.gap<=500+EPS&&s.gap>=-EPS&&s.bounds[2]>s.bounds[0]&&s.bounds[3]>s.bounds[1]);
}
export function coverageAxes(min,max,spacing,phase){const out=[];for(let k=Math.floor((min-phase)/spacing);k<=Math.ceil((max-phase)/spacing);k++)out.push(phase+k*spacing);return out;}
