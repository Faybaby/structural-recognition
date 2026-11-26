import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {calculateOrdinaryBeams} from '../../stage1/ordinary-core.js';import {calculateBeams} from '../../stage1/beam-core.js';import {matchBeamPattern} from '../../stage1/support-rule-matching.js';
import {calculateOrdinaryLandings} from '../../stage1/ordinary-landing-core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8')),input=read('ordinary-input'),data=read('data');
const settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1},before=JSON.stringify(input),out=calculateOrdinaryBeams(input,settings);assert.equal(JSON.stringify(input),before);
const pb=out.beams.filter(b=>b.groupId==='even/PB012');assert(pb.length>=3);
const restored=pb.find(b=>b.matchedFrom?.includes('even/PB012/C03/JG1'));assert(restored&&!restored.calculationExempt);assert(restored.matchedFrom.includes('even/PB012/C02/JG1'));assert.equal(restored.length,1500);assert.equal(restored.matchedRule.id,'beam-junction-2.2');assert.deepEqual(restored.segments.map(s=>s.gtt),[425,1075]);assert.equal(restored.status,'passed');assert.equal(restored.nodes.length,1);assert(restored.nodes[0].junctionModulusException);
const j=restored.junctions.find(j=>j.point[0]===4825&&j.point[1]===8200);assert.equal(j.status,'placed');assert(j.modulusException);assert(j.reason.includes('模数例外'));assert.equal(j.modulusReview.maxDeviation,25);
const yinStrip=pb.find(b=>b.id==='even/PB012/C04/JG1');assert(yinStrip.calculationExempt);assert.equal(yinStrip.matchedRule.id,'exempt-yin-neck');assert.equal(yinStrip.nodes.length,0);
for(const b of out.beams){assert(b.matchedRule);assert(b.caseMatch);assert(b.calculationPipeline.length);if(b.calculationExempt){assert.equal(b.nodes.length,0);assert(b.caseMatch.sideTypes.includes('yin'));}if(b.caseMatch.previouslyExempt&&b.caseMatch.sideTypes.every(t=>t==='yang'))assert(!b.calculationExempt);}
for(const g of out.beamGroups)for(const part of g.calculationParts)assert(part.routeCount>0||part.pending);
const old=JSON.parse(execFileSync('git',['show','1fbaefdcdd0b6abfa361af88343781bb150c4334:stage1/ordinary-input.json'],{encoding:'utf8',maxBuffer:32e6}));assert.deepEqual(input.sources,old.sources);assert.deepEqual(input.groups.map(g=>g.region),old.groups.map(g=>g.region));assert.deepEqual(input.index,old.index);
// Shared GL matcher must preserve numerical behavior, including another baseline phase.
let oldCode=execFileSync('git',['show','1fbaefdcdd0b6abfa361af88343781bb150c4334:stage1/beam-core.js'],{encoding:'utf8'}).replace("'./floor-core.js'",JSON.stringify(new URL('../../stage1/floor-core.js',import.meta.url).href));
const legacy=await import('data:text/javascript;base64,'+Buffer.from(oldCode).toString('base64'));
const glInput=read('beam-input'),pick=r=>r.beams.map(b=>({id:b.id,status:b.status,index:b.index,gtt:b.gtt,h:b.h,ends:b.endOffsets,nodes:b.nodes.map(n=>({world:n.world,sourceHeight:n.sourceHeight,gll:n.gll}))}));
for(const origin of [[8600,4100],[9100,10800]]){const s={...settings,global:{...settings.global,origin}};assert.deepEqual(pick(calculateBeams(glInput,s)),pick(legacy.calculateBeams(glInput,s)));}
assert.equal(matchBeamPattern({ends:[{type:'yang'},{type:'yang'}]}).endCase,2);assert.equal(matchBeamPattern({ends:[{type:'yin'},{type:'yang'}]}).endCase,1);assert.equal(matchBeamPattern({ends:[{type:'yin'},{type:'yin'}]}).endCase,3);
assert.equal(matchBeamPattern({ends:[{type:'yin'},{type:'yin'}]},{junctions:[{id:'J',status:'placed',heightDifference:99}]}).id,'beam-junction-2.2');assert.notEqual(matchBeamPattern({ends:[{type:'yin'},{type:'yin'}]},{junctions:[{id:'J',status:'excluded',heightDifference:100}]}).id,'beam-junction-2.2');
assert.notEqual(matchBeamPattern({ends:[{type:'yin'},{type:'yin'}]},{junctions:[{id:'J',status:'excluded',heightDifference:0,exclusionType:'exempt-region'}]}).id,'beam-junction-2.2');
assert.equal(matchBeamPattern({ends:[{type:'yin'},{type:'yin'}],closed:true,path:{type:'arc'}}).id,'closed');
out.landings=calculateOrdinaryLandings({floors:out.landingFloors},data,read('landing-input'));
fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_分割后匹配计算_20261117.json',import.meta.url),JSON.stringify({...out,settings},null,2));
fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_含承接长度.json',import.meta.url),JSON.stringify({...out,settings},null,2));
const report={passed:true,summary:out.summary,landings:out.landings.summary,pb012:{matchedRule:restored.matchedRule,matchedParts:restored.matchedFrom,gtt:restored.segments.map(s=>s.gtt),exceptionJunction:j},glNumericsUnchanged:true,floorInputsUnchanged:true,nativeSourceGeometryUnchanged:true,restoredRoutes:out.beams.filter(b=>b.restoredFromExemption).length};fs.writeFileSync(new URL('./split-case-matching-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
