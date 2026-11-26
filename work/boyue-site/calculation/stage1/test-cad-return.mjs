import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {calculateOrdinaryBeams,beamPoint} from '../../stage1/ordinary-core.js';
import {layoutOrdinarySpan,layoutOrdinaryArc} from '../../stage1/ordinary-span.js';
import {layoutBeamSpan,calculateBeams} from '../../stage1/beam-core.js';
import {calculateOrdinaryLandings} from '../../stage1/ordinary-landing-core.js';
import {regionContains} from '../../stage1/floor-core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8'));
const input=read('ordinary-input'),data=read('data'),settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1};
const yin=[{type:'yin'},{type:'yin'}],span=L=>layoutOrdinarySpan({length:L,spacing:1000,gw:350,ends:yin,originProjection:0});
assert.deepEqual(span(2100).nodes.map(n=>n.t),[550,1550]);assert.deepEqual(span(3900).nodes.map(n=>n.t),[450,1450,2450,3450]);
assert.deepEqual(span(3400).nodes.map(n=>n.t),[700,1700,2700]);assert.equal(span(999).nodes.length,1);assert.equal(span(1000).nodes.length,1);assert.equal(span(2000).nodes.length,1);
// This was the reason to isolate the ordinary beam solver: GL still rejects 450mm end margins.
assert.equal(layoutBeamSpan({length:3900,spacing:1000,gw:350,ends:yin}).status,'pending');
for(const length of [400,900,2100,4100]){const r=layoutOrdinaryArc({length,spacing:1000,neighborOffsets:[50,50]});assert.equal(r.status,'passed');assert(r.yh.every(h=>h<=1000+1e-6));assert(r.actualGaps.every(h=>h<=1000+1e-6));assert(r.nodes.every(n=>n.t>0&&n.t<length));}
const before=JSON.stringify(input),out=calculateOrdinaryBeams(input,settings);assert.equal(JSON.stringify(input),before);
const by=id=>out.beams.find(b=>b.id===id);assert.equal(by('even/PB009/R01').length,2100);assert.equal(by('even/PB009/R01').height,550);assert.equal(by('even/PB009/R01').index.spacing,1000);assert.deepEqual(by('even/PB009/R01').nodes.map(n=>n.world),[[1900,13175],[2900,13175]]);
assert.deepEqual(by('even/PB009/R03').nodes.map(n=>n.world),[[4850,13175],[5850,13175],[6850,13175],[7850,13175]]);
assert.deepEqual(by('even/PB024/R01').nodes.map(n=>n.world),[[17200,16175],[18200,16175],[19200,16175]]);
assert(by('even/PB009/R04/P02').segments[0].arcRule);assert.equal(by('even/PB009/R04/P02').nodes.length,1);
assert.equal(by('even/PB003/R01/P02').thickness,120);assert.equal(by('even/PB003/R01/P02').index.spacing,1000);
assert.equal(by('even/PB003/CAD-A02').index.spacing,900);assert.equal(by('even/PB003/CAD-A02').status,'passed');
const diagonal=by('even/PB003/CAD-D01');assert(diagonal.requiresLocalBaseline);assert.equal(diagonal.baselineScope,'route');assert(diagonal.nodes.length>0);
const local={...settings,ordinaryBaselines:{[diagonal.id]:{origin:diagonal.start,angleDeg:diagonal.axisAngleDeg,confirmed:true}}};const adjusted=calculateOrdinaryBeams(input,local).beams.find(b=>b.id===diagonal.id);assert.equal(adjusted.baselineScope,'route');assert(!adjusted.reasons.some(r=>r.includes('独立基准')));
const wrong={...settings,ordinaryBaselines:{[diagonal.id]:{origin:[0,0],angleDeg:0,confirmed:true}}};assert(calculateOrdinaryBeams(input,wrong).beams.find(b=>b.id===diagonal.id).reasons.some(r=>r.includes('独立基准')));
for(const b of out.beams){assert.equal(b.height,data.plans.find(p=>p.key===b.key).level-out.beamGroups.find(g=>g.id===b.groupId).bottom);for(const e of b.ends)if(!e.curveSplit&&e.nativeType==='yin')assert.equal(e.type,'yin');if(b.calculationExempt)assert.equal(b.nodes.length,0);if(b.status==='passed')for(const n of b.nodes){assert(regionContains(n.world,input.sources.find(s=>s.id===n.sourceRegion).region));assert(n.modulusException||Math.abs(n.axisCoordinate/50-Math.round(n.axisCoordinate/50))<1e-6);assert((n.origin==='梁梁交点'&&b.junctions.some(j=>j.status==='placed'&&Math.hypot(...j.point.map((v,k)=>v-n.world[k]))<.01))||Math.hypot(...beamPoint(b.path,n.t).map((v,j)=>v-n.world[j]))<1e-5);}}
const old=JSON.parse(execFileSync('git',['show','6cd91bd1a8b98358983fb29ab58c2f2f43652f89:stage1/ordinary-input.json'],{encoding:'utf8',maxBuffer:32*1024*1024}));assert.deepEqual(old.sources,input.sources);assert.deepEqual(old.groups.map(g=>g.region),input.groups.map(g=>g.region));
for(const name of ['data.json','floor-input.json','floor-core.js','floor-ui.js','beam-input.json','partition-input.json','landing-core.js'])assert.equal(fs.readFileSync(new URL('../../stage1/'+name,import.meta.url),'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show','6cd91bd1a8b98358983fb29ab58c2f2f43652f89:stage1/'+name],{encoding:'utf8',maxBuffer:32*1024*1024}).replaceAll('\r\n','\n'),name);
const gl=calculateBeams(read('beam-input'),settings);assert.equal(gl.summary.uniqueModelPoints,44);
out.landings=calculateOrdinaryLandings({floors:out.landingFloors},data,read('landing-input'));assert.equal(out.landings.summary.total,out.points.length*2);
fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_修正版规则后.json',import.meta.url),JSON.stringify({...out,settings},null,2));
fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_含承接长度.json',import.meta.url),JSON.stringify({...out,settings},null,2));
const report={passed:true,source:read('cad-review-input').sha256,summary:out.summary,landings:out.landings.summary,retainedNativeFaces:input.sources.length,floorAndGLUnchanged:true,threeDRegionsUnchanged:true,glModelPoints:gl.summary.uniqueModelPoints,diagonalNeedsBaseline:true,example2100:by('even/PB009/R01').nodes.map(n=>n.world),example3900:by('even/PB009/R03').nodes.map(n=>n.world),tableMismatch:{route:'even/PB003/CAD-A02',section:[400,550],slab:120,spacing:900,reason:'CAD示例1000与原表D89=900不同，保留原表计算并列出差异'}};
fs.writeFileSync(new URL('./cad-return-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
