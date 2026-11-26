import fs from 'node:fs';import assert from 'node:assert/strict';
import {calculateFloors,axisPositions,regionContains,ringDistance} from '../../stage1/floor-core.js';
import {fromBaseline,toBaseline} from '../../stage1/baseline-core.js';
const polygon=(w,h)=>[[0,0],[w,0],[w,h],[0,h]];
function fixture({width=3850,height=3850,sx=1200,sy=1200,holes=[],base={origin:[0,0],angleDeg:0}}={}){
 const r={polygon:polygon(width,height).map(p=>fromBaseline(p,base)),holes:holes.map(r=>r.map(p=>fromBaseline(p,base)))};
 const floor={id:'even/A',key:'even',name:'A',memberIds:['A'],memberBaselineKeys:['even/A'],alignmentGroup:'G1',region:[r],holes:holes.map((h,i)=>{const a=h.map(p=>p[0]),b=h.map(p=>p[1]),w=Math.max(...a)-Math.min(...a),l=Math.max(...b)-Math.min(...b);return {id:'H'+i,polygon:h.map(p=>fromBaseline(p,base)),width:w,length:l,small:w<1000&&l<1000};}),thickness:120,members:[{id:'A',face:'face-A',bottom:2880,region:[r]}]};
 return {input:{storyHeight:3000,source:{file:'test-fixture',sheet:'fixture'},rules:{},index:[{thickness:120,storyHeight:3000,sx,sy,cell:'TEST',sourceValue:sx+'×'+sy}],floors:[floor],overlapGroups:[{id:'G1',floors:[floor.id],pairs:[]}]},settings:{global:base,locals:{},revision:1}};
}
let f=fixture(),r=calculateFloors(f.input,f.settings).floors[0];assert.equal(r.status,'passed');assert.equal(r.nodes.length,9);assert.equal(r.cells,4);assert.deepEqual(r.h,[700,750,700,750]);assert(r.x.every(x=>x%50===0));assert(r.x.slice(1).every((x,i)=>x-r.x[i]===1200));
assert.equal(axisPositions(0,2200,1200,500)?.h1,500);assert.equal(axisPositions(0,2200,1200,1100),null);
for(const angle of [30,90,-25]){f=fixture({base:{origin:[8600,4100],angleDeg:angle}});r=calculateFloors(f.input,f.settings).floors[0];assert.equal(r.status,'passed');for(const n of r.nodes){assert(regionContains(n.world,f.input.floors[0].region));const q=toBaseline(n.world,r.base);assert(q.every(v=>Math.abs(v/50-Math.round(v/50))<1e-8));}}
f=fixture({holes:[[[850,700],[950,700],[950,800],[850,800]]]});r=calculateFloors(f.input,f.settings).floors[0];assert.equal(r.status,'passed');assert(r.holeChecks.every(h=>h.a1>150||h.a2>150));assert(!r.phase.every(v=>v===700));
f=fixture({width:6450,height:6450,holes:[[[1450,1450],[2450,1450],[2450,2450],[1450,2450]]]});r=calculateFloors(f.input,f.settings).floors[0];assert.equal(r.status,'passed');assert(r.omittedInsideHoles>0);assert(r.holeChecks[0].large);assert(r.holeChecks[0].offsets.every(v=>v>=80&&v<=140));assert(r.nodes.some(n=>n.origin==='洞周外围'));assert(r.nodes.every(n=>!regionContains([n.u,n.v],[{polygon:f.input.floors[0].holes[0].polygon,holes:[]}])));
f=fixture({width:4050,sx:1300,sy:1200});r=calculateFloors(f.input,f.settings).floors[0];assert.equal(r.index.sx,1300);assert.equal(r.index.sy,1200);assert(r.x.slice(1).every((x,i)=>x-r.x[i]===1300));
f=fixture({width:650});r=calculateFloors(f.input,f.settings).floors[0];assert.equal(r.status,'exempt');assert.equal(r.nodes.length,0);
f=fixture();const other=structuredClone(f.input.floors[0]);other.id='odd/B';other.key='odd';other.memberBaselineKeys=['odd/B'];f.input.floors.push(other);f.input.overlapGroups=[{id:'G1',floors:['even/A','odd/B'],pairs:[{a:'even/A',b:'odd/B'}]}];let out=calculateFloors(f.input,f.settings);assert(out.floors.every(r=>r.status==='passed'));assert.deepEqual(out.floors[0].nodes.map(n=>n.world),out.floors[1].nodes.map(n=>n.world));f.settings.locals['odd/B']={origin:[25,0],angleDeg:0};out=calculateFloors(f.input,f.settings);assert(out.floors.every(r=>r.status==='pending'));
const input=JSON.parse(fs.readFileSync(new URL('../../stage1/floor-input.json',import.meta.url),'utf8'));const settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1};out=calculateFloors(input,settings);
for(const r of out.floors.filter(r=>r.status==='passed')){
 if(r.h&&!r.connectedHole)assert(r.h[0]>=500&&r.h[0]<r.index.sx-100&&r.h[1]>=500&&r.h[1]<r.index.sx-100&&r.h[2]>=500&&r.h[2]<r.index.sy-100&&r.h[3]>=500&&r.h[3]<r.index.sy-100);
 const floor=input.floors.find(f=>f.id===r.id);assert(r.nodes.every(n=>regionContains(n.world,floor.region)));assert(r.nodes.every(n=>[n.u,n.v].every(v=>Math.abs(v/50-Math.round(v/50))<1e-7)));
 assert.equal(r.index.sx,input.index.find(x=>x.cell===r.index.cell&&x.storyHeight===3000).sx);
}
fs.writeFileSync(new URL('../../../../outputs/楼面支撑_实际基准计算结果.json',import.meta.url),JSON.stringify({...out,actualBaseline:settings},null,2));
const report={passed:true,actualBaseline:settings,summary:out.summary,checks:['固定表值不扣100','端距下限含500与上限S-100','50mm模数与1450余量700/750','旋转基准坐标','小洞口150mm严格边界','1000mm洞口不使用小洞口豁免','洞内交点剔除与实际净距','650mm窄面按规则免放且与待处理区分','上下同位与局部基准模数冲突','全部通过点均在实际楼面投影内']};fs.writeFileSync(new URL('./floor-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
