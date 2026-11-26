import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolveSlabThickness,withBeamSlabThickness} from '../../stage1/slab-thickness.js';
import {beamLookup,calculateBeams} from '../../stage1/beam-core.js';
import {calculateOrdinaryBeams} from '../../stage1/ordinary-core.js';
import {calculateOrdinaryLandings} from '../../stage1/ordinary-landing-core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8'));
const input=read('ordinary-input'),gl=read('beam-input'),data=read('data'),settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1};
for(const value of [undefined,null,0,-1,NaN,Infinity]){const r=resolveSlabThickness(value);assert(r.defaulted);assert.equal(r.sourceValue,null);assert.equal(r.calculationValue,150);}
for(const value of [100,120,150,250]){const r=resolveSlabThickness(value);assert(!r.defaulted);assert.equal(r.calculationValue,value);}
const source=JSON.stringify(input),out=calculateOrdinaryBeams(input,settings);assert.equal(JSON.stringify(input),source);
const fallback=out.beams.filter(b=>b.slabThickness.defaulted);assert(fallback.length>=1);assert(fallback.every(b=>b.thickness===150));
const b=fallback.find(b=>b.id==='odd/PB029/R01');assert.equal(b.id,'odd/PB029/R01');assert.equal(b.thickness,150);assert.equal(b.slabThickness.sourceValue,null);assert.equal(b.index.thickness,150);assert.equal(b.index.spacing,1200);assert.equal(b.status,'passed');assert(!b.reasons.some(s=>s.includes('板厚')));assert(b.nodes.length>0);
const explicit=structuredClone(input);for(const b of explicit.beams)if(!Number.isFinite(b.thickness)||b.thickness<100||b.thickness>250){b.thickness=150;b.issues=b.issues.filter(s=>s!=='邻域没有可靠板厚，暂不猜测查表列');}
const geometry=r=>r.beams.map(b=>({id:b.id,status:b.status,reasons:b.reasons,index:b.index,nodes:b.nodes.map(({id,...n})=>n),segments:b.segments.map(({neighborReview,...s})=>s)}));
assert.deepEqual(geometry(out),geometry(calculateOrdinaryBeams(explicit,settings)));
// Recognized in-range thickness stays unchanged; out-of-range readings remain in metadata.
for(const value of [99,260,470]){const r=resolveSlabThickness(value);assert(r.defaulted);assert.equal(r.sourceValue,value);assert.equal(r.calculationValue,150);}
assert.equal(beamLookup(input,{width:200,height:550,thickness:null}).cell,b.index.cell);
assert.equal(beamLookup(input,{width:200,height:550,thickness:260}).thickness,150);
assert.equal(beamLookup({...input,storyHeight:3600},{width:200,height:550,thickness:null}),null);
assert.equal(beamLookup(input,{width:null,height:550,thickness:null}),null);
assert.equal(beamLookup(input,{width:200,height:null,thickness:null}),null);
assert.equal(beamLookup({...input,index:input.index.filter(r=>r.thickness!==150)},{width:200,height:550,thickness:null}).thickness,160);
assert(withBeamSlabThickness({thickness:null,issues:['阴阳边证据待核对','邻域没有可靠板厚，暂不猜测查表列']}).issues.includes('阴阳边证据待核对'));
const unknownGl=structuredClone(gl);unknownGl.beams=unknownGl.beams.slice(0,1);unknownGl.beams[0].thickness=null;unknownGl.beams[0].issues=['300mm邻域内没有已确认板厚，暂不猜测查表列'];
const r=calculateBeams(unknownGl,settings).beams[0];assert(r.slabThickness.defaulted);assert.equal(r.index.thickness,150);assert(!r.reasons.some(s=>s.includes('板厚缺项')));
const normalGl=calculateBeams(gl,settings);assert(normalGl.beams.every(b=>!b.slabThickness.defaulted));
out.landings=calculateOrdinaryLandings({floors:out.landingFloors},data,read('landing-input'));
fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_含承接长度.json',import.meta.url),JSON.stringify({...out,settings},null,2));
const report={passed:true,summary:out.summary,landings:out.landings.summary,defaultedRoutes:fallback.map(b=>({id:b.id,sourceThickness:b.slabThickness.sourceValue,calculationThickness:b.thickness,index:b.index,status:b.status,nodes:b.nodes.map(n=>n.world)})),recognizedInRangeThicknessRetained:true,inputUnchanged:true};
fs.writeFileSync(new URL('./missing-slab-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
