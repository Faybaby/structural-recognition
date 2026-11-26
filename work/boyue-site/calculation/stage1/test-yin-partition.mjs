import fs from 'node:fs';
import assert from 'node:assert/strict';
import {calculateOrdinaryBeams} from '../../stage1/ordinary-core.js';
import {calculateOrdinaryLandings} from '../../stage1/ordinary-landing-core.js';
import {calculateFloors,regionContains} from '../../stage1/floor-core.js';
import {calculateLandings} from '../../stage1/landing-core.js';
import {applyPartition} from '../../stage1/partition-core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8'));
const data=read('data'),floor=read('floor-input'),input=read('ordinary-input'),partition=read('partition-input');
const originalGL=JSON.stringify(read('beam-input'));
const settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1};
applyPartition(data,floor,partition);
const out=calculateOrdinaryBeams(input,settings);
for(const b of input.beams)for(const e of b.ends){
 if(e.curveSplit||e.nativeType==='calculation-cut')continue;
 assert(e.yinPriority);
 const originalYin=e.nativeType==='yin';
 assert.equal(e.nativeType,originalYin?'yin':'yang');
 assert.equal(e.type,originalYin||e.partitionYin?'yin':'yang');
}
for(const g of out.beamGroups){
 assert(g.calculationParts.every(c=>c.exempt||c.routeCount>0||c.pending));
 if(g.status==='exempt')assert(g.calculationParts.every(c=>c.exempt));
}
for(const b of out.beams){
 if(b.status!=='passed'){assert.equal(b.nodes.length,0);continue;}
 if(b.calculationExempt){assert.equal(b.nodes.length,0);continue;}
 assert(!b.calculationPart.exempt);
 for(const n of b.nodes){
  assert(regionContains(n.world,input.sources.find(s=>s.id===n.sourceRegion).region));
  assert(n.modulusException||Math.abs(n.axisCoordinate/50-Math.round(n.axisCoordinate/50))<1e-6);
 }
 if(b.offsetRule)assert.equal(b.offsetRule.distance,b.calculationPart.width<=300.025?50:100);
 for(const e of b.ends){if(e.curveSplit||e.nativeType==='calculation-cut')continue;assert(e.yinPriority);if(e.nativeType==='yin'||e.partitionYin)assert.equal(e.type,'yin');if(e.nativeType==='yang'&&!e.partitionYin)assert.equal(e.type,'yang');}
 for(const n of b.nodes.filter(n=>n.origin==='阳线端部'))assert(b.ends.some((e,i)=>e.type==='yang'&&Math.abs(n.t-(i?b.length-n.gll:n.gll))<1e-5));
}
const example=out.beams.filter(b=>b.groupId==='even/PB023');
assert(example.length>=2);assert(example.every(b=>b.ends.every(e=>e.type==='yin')));
assert(example.every(b=>b.nodes.every(n=>n.origin!=='阳线端部')));
assert.equal(example.find(b=>b.id==='even/PB023/R01').nodes.filter(n=>n.origin!=='梁梁交点').length,0);assert(example.find(b=>b.id==='even/PB023/R01').nodes.every(n=>n.junctionModulusException));
assert.equal(new Set(out.points.map(n=>n.key+'/'+n.world.map(v=>v.toFixed(3)).join('/')+'/'+n.sourceHeight)).size,out.points.length);
out.landings=calculateOrdinaryLandings({floors:out.landingFloors},data,read('landing-input'));
fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_含承接长度.json',import.meta.url),JSON.stringify({...out,settings},null,2));
const floors=calculateFloors(floor,settings);floors.landings=calculateLandings(floors,data,read('landing-input'));
for(const r of floors.floors)for(const n of r.nodes){
 const f=floor.floors.find(f=>f.id===r.id);assert(regionContains(n.world,f.region));
 assert(!regionContains(n.world,f.beamExclusions||[]));
}
const r074=floor.floors.find(f=>f.id==='even/even-R074');
assert(Math.abs(r074.area-4.65)<1e-8);assert.equal(r074.beamExclusions.length,0);
for(const id of ['even/even-R007','even/even-R157']){
 const f=floor.floors.find(f=>f.id===id);assert.equal(f.beamExclusions.length,0);
 assert(f.slabCutEvidence.every(e=>!e.applied));
}
const originalFloors=calculateFloors(read('floor-input'),settings);
assert.deepEqual(floors.floors.map(f=>[f.id,f.status,f.nodes.map(n=>[n.world,n.sourceHeight])]),originalFloors.floors.map(f=>[f.id,f.status,f.nodes.map(n=>[n.world,n.sourceHeight])]));
const shownBaseline={...settings,global:{origin:[9100,10800],angleDeg:0}};
const shownAfter=calculateFloors(floor,shownBaseline),shownBefore=calculateFloors(read('floor-input'),shownBaseline);
for(const id of ['even/even-R007','even/even-R157'])assert.deepEqual(shownAfter.floors.find(f=>f.id===id).nodes,shownBefore.floors.find(f=>f.id===id).nodes);
assert.equal(originalGL,JSON.stringify(read('beam-input')));
const report={passed:true,ordinary:out.summary,ordinaryLandings:out.landings.summary,floor:floors.summary,floorLandings:floors.landings.summary,checks:['native阴线分段','only neck fragments <=200 exempt; equal-width ordinary beams remain','only yang AND actual beam overlap permits slab carve','even-R007 and even-R157 restored as complete slabs','no point lies in a removed beam patch','native yin survives partition; yin takes precedence over width transition','junction height rule retained; true-junction modulus exceptions flagged','original GL input unchanged','positions only, no components selected']};
fs.writeFileSync(new URL('./yin-partition-verification.json',import.meta.url),JSON.stringify(report,null,2));
fs.writeFileSync(new URL('../../../../outputs/楼面支撑_阴线拼接后.json',import.meta.url),JSON.stringify({...floors,settings},null,2));
console.log(JSON.stringify(report));
