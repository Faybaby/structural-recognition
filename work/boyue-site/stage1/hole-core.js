const EPS=1e-5;
export function isLargeHole(h){return Math.max(h.width,h.length)>=1000-EPS&&Math.min(h.width,h.length)>=800-EPS;}
export function offsetAxis(edge,side){
 const values=[];for(let p=Math.ceil((edge+(side<0?-140:80)-EPS)/50)*50;p<=edge+(side<0?-80:140)+EPS;p+=50)values.push(p);
 return values.sort((a,b)=>Math.abs(Math.abs(a-edge)-100)-Math.abs(Math.abs(b-edge)-100)||a-b)[0]??null;
}
export function splitHoleSpan(a,b,max){const count=Math.ceil((b-a-EPS)/max),out=[a];for(let i=1;i<count;i++)out.push(a+Math.round(((b-a)*i/count)/50)*50);out.push(b);return out;}
export function edgeFill(start,boundary,spacing){
 const direction=Math.sign(boundary-start),span=Math.abs(boundary-start),out=[];if(span<=spacing+EPS)return out;
 let traveled=0;while(span-traveled>spacing+EPS){const next=traveled+Math.min(spacing,span-traveled-500),raw=start+direction*next,p=(direction>0?Math.floor((raw+EPS)/50):Math.ceil((raw-EPS)/50))*50;if(Math.abs(p-start)<=traveled+EPS)break;out.push(p);traveled=Math.abs(p-start);}
 return out;
}
export function holeLayout(h,sx,sy,intervals,{allowBoundaryException=false}={}){
 const u=h.local.map(p=>p[0]),v=h.local.map(p=>p[1]),b=[Math.min(...u),Math.min(...v),Math.max(...u),Math.max(...v)];
 if(h.local.some((p,i)=>{const q=h.local[(i+1)%h.local.length];return Math.abs(p[0]-q[0])>EPS&&Math.abs(p[1]-q[1])>EPS;}))return {error:'大洞口边线与当前基准不平行，洞周外偏待核对'};
 const box=[offsetAxis(b[0],-1),offsetAxis(b[1],-1),offsetAxis(b[2],1),offsetAxis(b[3],1)];if(box.some(p=>p===null))return {error:'洞边外偏80～140mm与基准50mm模数无共同取值'};
 const xs=splitHoleSpan(box[0],box[2],sx),ys=splitHoleSpan(box[1],box[3],sy),nodes=[];
 const add=(u,v,origin)=>{if(!nodes.some(n=>Math.abs(n.u-u)<EPS&&Math.abs(n.v-v)<EPS))nodes.push({u,v,origin,holeId:h.id});};
 for(const x of xs)for(const y of [box[1],box[3]])add(x,y,'洞周外围');for(const y of ys)for(const x of [box[0],box[2]])add(x,y,'洞周外围');
 const edgeChecks=[];
 for(const y of ys){const span=intervals(y,false).find(([a,b])=>a<=box[0]+EPS&&b>=box[2]-EPS);if(!span)return {error:'洞周外围点不在同一真实楼面行区段'};for(const [x,boundary] of [[box[0],span[0]],[box[2],span[1]]]){const added=edgeFill(x,boundary,sx);for(const p of added)add(p,y,'洞周距边补点');edgeChecks.push({axis:'X',at:y,start:x,boundary,span:Math.abs(boundary-x),spacing:sx,added});}}
 for(const x of xs){const span=intervals(x,true).find(([a,b])=>a<=box[1]+EPS&&b>=box[3]-EPS);if(!span)return {error:'洞周外围点不在同一真实楼面列区段'};for(const [y,boundary] of [[box[1],span[0]],[box[3],span[1]]]){const added=edgeFill(y,boundary,sy);for(const p of added)add(x,p,'洞周距边补点');edgeChecks.push({axis:'Y',at:x,start:y,boundary,span:Math.abs(boundary-y),spacing:sy,added});}}
 const short=edgeChecks.find(c=>c.span<500-EPS);
 return {box,nodes,offsets:[b[0]-box[0],b[1]-box[1],box[2]-b[2],box[3]-b[3]],outerSize:[box[2]-box[0],box[3]-box[1]],perimeterX:xs,perimeterY:ys,edgeChecks,boundaryExceptions:allowBoundaryException?edgeChecks.filter(c=>c.span<500-EPS):[],...(short&&!allowBoundaryException?{error:`洞周外偏后${short.axis}向距楼面边仅${short.span.toFixed(1)}mm，小于500mm，未生成正式洞周点`}:{})};
}
