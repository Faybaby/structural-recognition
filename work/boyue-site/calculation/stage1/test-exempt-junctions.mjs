import fs from 'node:fs';import assert from 'node:assert/strict';
import {calculateOrdinaryBeams} from '../../stage1/ordinary-core.js';
import {groupEdgeLabels,beamSideEdges} from '../../stage1/ordinary-edge-labels.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8'));
const input=read('ordinary-input'),edges=read('ordinary-edge-input'),settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1};
const result=calculateOrdinaryBeams(input,settings),b=result.beams.find(b=>b.matchParent==='even/PB027/R01'||b.id==='even/PB027/R01'),j=result.junctions.find(j=>j.point[0]===29400&&j.point[1]===8250);
assert.equal(j.status,'excluded');assert.equal(j.exclusionType,'exempt-region');assert(j.exemptParticipants.includes('even/PB046/C01/JG1'));
assert(!result.points.some(n=>n.origin==='梁梁交点'&&n.world[0]===29400&&n.world[1]===8250));
assert(!b.segments.some(s=>s.leftType==='交点'||s.rightType==='交点'));
for(const j of result.junctions)if(j.exemptParticipants.length){assert.equal(j.status,'excluded');assert.equal(j.exclusionType,'exempt-region');}
for(const j of result.junctions.filter(j=>j.status==='placed'))assert.equal(j.exemptParticipants.length,0);
// A guide/exempt partner cannot manufacture a junction or block an otherwise valid route.
const copy=structuredClone(input);const guide=copy.beams.find(g=>g.id==='even/PB046/C01/JG1');guide.path.start[0]+=25;guide.path.end[0]+=25;guide.start[0]+=25;
assert.equal(calculateOrdinaryBeams(copy,settings).beams.find(b=>b.matchParent==='even/PB027/R01'||b.id==='even/PB027/R01').status,'passed');
const e46=groupEdgeLabels(edges,'even/PB046');
for(const p of [[31000,8100],[31000,8300]]){const match=e46.find(e=>Math.abs(e.start[1]-p[1])<.01&&Math.abs(e.end[1]-p[1])<.01&&Math.min(e.start[0],e.end[0])<=p[0]&&Math.max(e.start[0],e.end[0])>=p[0]);assert.equal(match.type,'yang');assert(match.checks.every(c=>c.insideAbove&&!c.insideBelow&&!c.outsideAbove&&!c.outsideBelow));}
for(const g of edges.groups)for(const e of g.boundaryEdges)if(['yin','yang','coplanar'].includes(e.type))assert(e.checks.length===3&&e.checks.every(c=>c.type===e.type));
const side=beamSideEdges(result.beams.find(b=>b.id==='even/PB046/R01'),e46);assert(side.every(s=>s.type==='yang'));
const report={passed:true,pb027Cancelled:j,excludedExemptJunctions:result.junctions.filter(j=>j.exclusionType==='exempt-region').length,summary:result.summary,pb046LongSides:side.map(s=>s.label)};
fs.writeFileSync(new URL('./exempt-junction-edge-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
