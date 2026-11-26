import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {calculateOrdinaryBeams} from '../../stage1/ordinary-core.js';
import {layoutOrdinarySpan} from '../../stage1/ordinary-span.js';
import {layoutStairBeam} from '../../stage1/cad-return-rules.js';
import {resolveSlabThickness} from '../../stage1/slab-thickness.js';
import {calculateFloors} from '../../stage1/floor-core.js';
import {calculateBeams} from '../../stage1/beam-core.js';
import {calculateOrdinaryLandings} from '../../stage1/ordinary-landing-core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8'));
const input=read('ordinary-input'),data=read('data'),settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1},before=JSON.stringify(input),out=calculateOrdinaryBeams(input,settings),by=id=>out.beams.find(b=>b.id===id);
assert.equal(JSON.stringify(input),before);
for(const value of [null,0,99,251,470])assert.equal(resolveSlabThickness(value).calculationValue,150);
assert.equal(resolveSlabThickness(470).sourceValue,470);assert(resolveSlabThickness(470).outOfRange);
for(const value of [100,120,150,250])assert.equal(resolveSlabThickness(value).calculationValue,value);
const continuous=by('even/PB023/R02/M01');assert.equal(continuous.length,3400);assert.deepEqual(continuous.nodes.map(n=>n.world),[[1550,9800],[2850,9800]]);assert(!out.beams.some(b=>b.id==='even/PB023/R02/M02'));
const unknown=by('even/PB010/R01');assert.equal(unknown.index.spacing,1100);assert.equal(unknown.index.cell,'G12');assert.equal(unknown.slabThickness.sourceValue,470);assert.deepEqual(unknown.segments[0].h,[850,850]);
const plain=by('even/PB047/R01');assert.equal(plain.index.spacing,1200);assert.deepEqual(plain.nodes.map(n=>n.world),[[20000,11750],[20000,12950]]);
const withGL=by('even/PB039/R01');assert(withGL.junctions.some(j=>j.beamIds.includes('even/GL002')&&j.status==='placed'));assert(withGL.nodes.some(n=>n.world[0]===16400&&n.world[1]===12250));assert(withGL.segments.some(s=>s.gtt===1150&&s.marginCorrection));
for(const id of ['even/PB012/R01','even/PB046/R01']){const b=by(id);assert(b.suppressedYangEndpoints.length);assert(!b.nodes.some(n=>n.origin==='阳线端部'));assert(b.ends.some(e=>e.type==='yang'));}
for(const id of ['even/PB011/STAIR-001','even/PB011/STAIR-002']){const b=by(id);assert.equal(b.length,2600);assert.equal(b.nodes.length,1);assert.equal(b.nodes[0].world[1],9600);assert.deepEqual(b.segments[0].h,[1300,1300]);}
const bigger=layoutStairBeam({length:5300,originProjection:0});assert(bigger.nodes.some(n=>n.t===2650));assert(bigger.h.every(h=>h<=1300));assert(bigger.actualGaps.every(g=>g<=1300));
const diag=by('even/PB003/CAD-D01');assert.equal(diag.baselineScope,'route');assert.equal(diag.status,'passed');assert(Math.abs(diag.nodes.find(n=>n.origin==='阳线端部').world[0]-8194.357222072254)<1e-7);assert.equal(diag.segments[0].h[0],650);
const long=by('even/PB003/CAD18-A01');assert.equal(long.length,4025);assert.equal(long.index.spacing,900);assert.deepEqual(long.segments[0].h,[650,675]);assert.deepEqual(long.nodes.filter(n=>n.origin!=='梁梁交点').map(n=>n.world),[[5600,1400],[6500,1400],[7400,1400],[8300,1400]]);
assert(out.beams.some(b=>b.id==='even/PB002/MIRROR-CAD18-A01'));assert(!out.beams.some(b=>b.id==='even/PB002/R01/P03'));assert(!out.beams.some(b=>b.id==='even/PB002/R04'));
const key=n=>[n.key,...n.world.map(v=>v.toFixed(3)),n.sourceHeight].join('/');assert.equal(new Set(out.points.map(key)).size,out.points.length);
for(const j of out.junctions){if(j.heightDifference>=100||j.exemptParticipants.length)assert.equal(j.status,'excluded');}
const yy=[{type:'yin'},{type:'yin'}];assert.equal(layoutOrdinarySpan({length:1099,spacing:1200,gw:200,ends:yy}).nodes.length,0);assert.equal(layoutOrdinarySpan({length:1100,spacing:1200,gw:200,ends:yy}).nodes.length,1);assert.equal(layoutOrdinarySpan({length:1150,spacing:1200,gw:200,ends:yy}).nodes.length,1);
for(const name of ['data.json','floor-input.json','beam-input.json','landing-input.json'])assert.equal(fs.readFileSync(new URL('../../stage1/'+name,import.meta.url),'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show','e8ba1a2af826ea5617b503bc2e60dc8752d95b9e:stage1/'+name],{encoding:'utf8',maxBuffer:64*1024*1024}).replaceAll('\r\n','\n'),name);
const floor=calculateFloors(read('floor-input'),settings),gl=calculateBeams(read('beam-input'),settings);assert.equal(floor.summary.uniqueModelPoints,332);assert.equal(gl.summary.uniqueModelPoints,44);
out.landings=calculateOrdinaryLandings({floors:out.landingFloors},data,read('landing-input'));
fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_含承接长度.json',import.meta.url),JSON.stringify({...out,settings},null,2));
const report={passed:true,summary:out.summary,landings:out.landings.summary,review:input.cadReview20261118,sourceAndFloorAndGLUnchanged:true,duplicatePhysicalPoints:0,diagonalAutoCentered:diag.segments[0].h,originalIndex200x700x150:unknown.index};fs.writeFileSync(new URL('./return-20261118-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,summary:out.summary,landings:out.landings.summary,floorPoints:floor.summary.uniqueModelPoints,glPoints:gl.summary.uniqueModelPoints}));
