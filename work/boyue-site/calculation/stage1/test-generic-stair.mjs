import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {calculateOrdinaryBeams} from '../../stage1/ordinary-core.js';
import {calculateOrdinaryLandings} from '../../stage1/ordinary-landing-core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8'));
const cases=JSON.parse(fs.readFileSync(new URL('../../../generic-stair-validation/fixtures.json',import.meta.url),'utf8'));
for(const c of cases){
 const inputBefore=JSON.stringify(c.input),out=calculateOrdinaryBeams(c.input,{global:c.settings.global_,locals:{},revision:1});assert.equal(JSON.stringify(c.input),inputBefore);assert.equal(out.beams.length,2);assert(out.beams.every(b=>b.stairBeam&&b.status==='passed'),c.name);
 for(const b of out.beams){const expected=c.expectedCenters.find(p=>Math.hypot(p[0]-(b.start[0]+b.end[0])/2,p[1]-(b.start[1]+b.end[1])/2)<.001);assert(expected,c.name);assert(b.nodes.some(n=>Math.hypot(n.world[0]-expected[0],n.world[1]-expected[1])<.001),c.name);assert(b.segments[0].h.every(h=>h<=1300+.001));assert(b.segments[0].actualGaps.every(h=>h<=1300+.001));}
}
const input=read('ordinary-input'),data=read('data'),settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1},out=calculateOrdinaryBeams(input,settings),stairs=out.beams.filter(b=>b.stairBeam);
assert.equal(stairs.length,4);assert.deepEqual([...new Set(stairs.map(b=>b.key))].sort(),['even','odd']);
for(const b of stairs){assert.equal(b.length,2600);assert.equal(b.nodes.length,1);assert.equal(b.nodes[0].world[1],9600);assert.deepEqual(b.segments[0].h,[1300,1300]);assert(b.stairRecognition.fullAxisOnNativeBeam);assert.equal(b.stairRecognition.projectSpecificSelection,false);assert.equal(b.matchedRule.id,'stair-centre-first');}
assert.deepEqual(stairs.filter(b=>b.key==='even').map(b=>b.nodes[0].world).sort(),stairs.filter(b=>b.key==='odd').map(b=>b.nodes[0].world).sort());
const old=JSON.parse(execFileSync('git',['show','f03b909114d39cde61cde2851a1485e8958a39e7:stage1/ordinary-input.json'],{encoding:'utf8',maxBuffer:64e6}));assert.deepEqual(input.sources,old.sources);assert.deepEqual(input.groups.map(g=>g.region),old.groups.map(g=>g.region));
const pick=b=>({id:b.id,nodes:b.nodes.map(n=>({world:n.world,sourceHeight:n.sourceHeight})),status:b.status,index:b.index,segments:b.segments});const before=calculateOrdinaryBeams(old,settings),oldMap=new Map(before.beams.map(b=>[b.id,b]));for(const b of out.beams.filter(b=>!b.stairBeam))assert.deepEqual(pick(b),pick(oldMap.get(b.id)),b.id);
out.landings=calculateOrdinaryLandings({floors:out.landingFloors},data,read('landing-input'));fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_含承接长度.json',import.meta.url),JSON.stringify({...out,settings},null,2));
const report={passed:true,transformedCalculationCases:cases.length,allModelsRecognized:true,noProjectOrFloorSelectors:true,nonStairNumericsUnchanged:true,nativeGeometryUnchanged:true,stairs:stairs.map(b=>({id:b.id,length:b.length,world:b.nodes[0].world,h:b.segments[0].h,evidence:b.stairRecognition})),summary:out.summary,landings:out.landings.summary};fs.writeFileSync(new URL('./generic-stair-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

