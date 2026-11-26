import fs from 'node:fs';
import assert from 'node:assert/strict';
import {calculateFloors,regionContains} from '../../stage1/floor-core.js';
import {splitThroughHole,holeEdgeStrips} from '../../stage1/layout-zones.js';
const input=JSON.parse(fs.readFileSync(new URL('../../stage1/floor-input.json',import.meta.url)));
const settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1};
const output=calculateFloors(input,settings),find=id=>output.floors.find(r=>r.id===id);
for(const id of ['odd/odd-R159','odd/odd-R160']){const r=find(id);assert.equal(r.narrowSize,1290);assert.equal(r.narrowThreshold,1200);assert.equal(r.status,'passed');assert.equal(r.nodes.length,2);}
for(const id of ['odd/odd-R147','odd/odd-R148','even/even-R150','even/even-R151']){
 const r=find(id);assert.equal(r.status,'passed');assert.equal(r.connectedHole,true);assert(!r.splitParts);assert(!r.partitionGuides);assert.equal(r.nodes.length,6);assert.equal(r.excludedStrips.length,1);assert.equal(r.excludedStrips[0].gap,500);
 assert.equal(r.nodes.filter(n=>n.boundaryException).length,4);assert.equal(r.nodes.filter(n=>!n.boundaryException).length,2);
 const floor=input.floors.find(f=>f.id===id);assert(r.nodes.every(n=>regionContains(n.world,floor.region)));
 for(const n of r.nodes.filter(n=>!n.boundaryException)){assert(r.rowChecks.filter(c=>Math.abs(c.at-n.v)<1e-5).every(c=>n.u-c.start>=500&&c.end-n.u>=500));assert(r.columnChecks.filter(c=>Math.abs(c.at-n.u)<1e-5).every(c=>n.v-c.start>=500&&c.end-n.v>=500));}
 assert(r.x.slice(1).every((v,i)=>v-r.x[i]<=r.index.sx));assert(r.y.slice(1).every((v,i)=>v-r.y[i]<=r.index.sy));
}
assert.equal(find('odd/odd-R145').splitParts.length,2);
const ring=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const hole={local:ring(1800,1000,2800,2000),box:[1700,900,2900,2100]};
// The decision uses the physical strip, not the 100mm perimeter offset or Sx/Sy.
assert.equal(splitThroughHole([{polygon:ring(0,0,5000,3000),holes:[]}],hole),null);
const edgeHole={local:ring(1800,500,2800,1500),box:[1700,400,2900,1600]};
assert.equal(splitThroughHole([{polygon:ring(0,0,5000,2000),holes:[]}],edgeHole).length,2);
assert.equal(holeEdgeStrips([{polygon:ring(0,0,5000,2000),holes:[]}],edgeHole).length,2);
assert.equal(splitThroughHole([{polygon:ring(0,-1,5000,2001),holes:[]}],edgeHole),null);
// Browser-local baseline choices remain valid; no baseline is written by the calculation.
const other=structuredClone(settings);other.global.origin=[9100,10800];const check=calculateFloors(input,other);
assert.deepEqual(check.summary,output.summary);assert.deepEqual(check.floors.map(r=>r.nodes.map(n=>n.world)),output.floors.map(r=>r.nodes.map(n=>n.world)));assert.deepEqual(settings.global.origin,[8600,4100]);
const report={passed:true,summary:output.summary,threshold:'physical narrow side < min(Sx,Sy)-100; equality calculates',connectivity:'500mm strips inclusive; 501mm bridge remains connected',examples:['odd/odd-R159','odd/odd-R160','odd/odd-R148','odd/odd-R145'].map(id=>{const r=find(id);return {id,status:r.status,points:r.nodes.length,threshold:r.narrowThreshold,connected:!!r.connectedHole,parts:r.splitParts?.map(p=>({name:p.name,dimensions:p.dimensions})),excludedStrips:r.excludedStrips};}),checks:['1290>=1200 re-enters calculation','single connected floor reuses perimeter axes without duplicate nearby grid','ordinary points retain 500mm clearance','500 and 501 topology boundary','both saved baseline examples produce identical world points']};
fs.writeFileSync(new URL('./connectivity-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
