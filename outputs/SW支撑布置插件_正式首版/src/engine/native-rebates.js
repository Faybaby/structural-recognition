import {regionContains,ringDistance} from './floor-core.js';

const normalizePath=path=>path?.replaceAll('\\','/').toLowerCase();
const footprint=f=>[{polygon:f.polygon,holes:f.holes||[]}];
const center=t=>[0,1].map(i=>(t[0][i]+t[1][i]+t[2][i])/3);
const crossArea=t=>Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[2][0]-t[0][0])*(t[1][1]-t[0][1]))/2;

function drawingToAssembly(point, transform){
 const [x,y]=point;
 const k=transform[12];
 // The registered CAD plan uses local SW X/-Z, with millimetre plan coordinates.
 return [(x*transform[0]-y*transform[6])*k+transform[9]*1000,
         -(x*transform[2]-y*transform[8])*k-transform[11]*1000];
}

export function recognizeRebates(faces,catalog,axis){
 if(!catalog||axis!==catalog.axis)return faces;
 const eligible=faces.filter(f=>!f.receiverOnly&&!f.sloped&&!f.topPlaneExcluded&&f.kind==='ordinary');
 const composites=new Map(),byComponent=new Map(),links=new Map();
 for(const lip of eligible){
  if(!catalog.assemblyCoordinates&&(normalizePath(lip.partPath)!==normalizePath(catalog.partPath)||lip.partConfiguration!==catalog.partConfiguration||!lip.componentTransform?.length))continue;
  const t=lip.componentTransform;
  if(!catalog.assemblyCoordinates&&(Math.abs(t[1])>1e-7||Math.abs(t[7])>1e-7))continue;
  const ring=lip.polygon;
  const perimeter=ring.reduce((total,p,i)=>total+Math.hypot(p[0]-ring[(i+1)%ring.length][0],p[1]-ring[(i+1)%ring.length][1]),0);
  if(!(perimeter>0)||2*lip.area/perimeter>120)continue;
  const possible=eligible.filter(b=>b.component===lip.component&&b.area>lip.area*2&&b.height>lip.height+.025&&b.height-lip.height<=20.025);
  if(!possible.length)continue;
  if(!byComponent.has(lip.component)){
   const mapRing=ring=>catalog.assemblyCoordinates?ring:ring.map(p=>drawingToAssembly(p,t));
   byComponent.set(lip.component,catalog.features.map(f=>({source:f.source,region:f.region.map(p=>({polygon:mapRing(p.polygon),holes:(p.holes||[]).map(mapRing)}))})));
  }
  const hits=new Set();
  let covered=0,total=0;
  for(const tri of lip.triangles||[]){
   const at=center(tri),area=crossArea(tri);
   total+=area;
   const matches=byComponent.get(lip.component).filter(f=>regionContains(at,f.region));
   if(matches.length){covered+=area;for(const f of matches)hits.add(f.source);}
  }
  if(!total||covered/total<.75)continue;
  const candidates=[];
  for(const beam of possible){
   let shared=0;
   for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(a[0]-b[0],a[1]-b[1]);
    const count=Math.max(1,Math.ceil(length/25));
    for(let j=0;j<count;j++){
     const t=(j+.5)/count,q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
     if(ringDistance(q,beam.polygon)<.06)shared+=length/count;
    }
   }
   if(shared>Math.max(100,perimeter*.25))candidates.push({beam,shared});
  }
  if(candidates.length!==1)continue;
  const {beam,shared}=candidates[0];
  const link={faceId:lip.id,mainFace:beam.id,originalBottom:lip.height,calculationBottom:beam.height,
   step:beam.height-lip.height,sharedBoundary:shared,drawingHandles:[...hits].sort(),region:footprint(lip)};
  links.set(lip.id,link);
  if(!composites.has(beam.id))composites.set(beam.id,[]);
  composites.get(beam.id).push(link);
 }
 return faces.map(f=>{
  const link=links.get(f.id);
  if(link)return {...f,kind:'exclude',rebateLink:link,reason:f.reason+'。底图企口 '+link.drawingHandles.join('/')+'，并入相邻主梁，按 '+link.calculationBottom.toFixed(1)+' mm 梁底计算'};
  const members=composites.get(f.id);
  return members?{...f,rebateMembers:members,reason:f.reason+'。已合并底图确认的企口，按本主梁底标高计算'}:f;
 });
}
