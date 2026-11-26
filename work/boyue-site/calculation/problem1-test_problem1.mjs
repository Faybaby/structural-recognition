import fs from 'node:fs';import assert from 'node:assert/strict';
import {calculate,requirements,yangLength,inside,axisAt} from '../boyue-site/model3d/calculate.js';
const d=JSON.parse(fs.readFileSync('work/boyue-site/model3d-data.json','utf8'));
assert.equal(yangLength(1190),190);assert.equal(yangLength(1170),220);assert.equal(yangLength(1200),200);
assert.ok(d.plans.every(p=>p.registration.slabIntersectionOverUnion>.98));
assert.ok(d.plans.every(p=>p.nodes.every(n=>n.nativeFacePass)));
assert.ok(d.plans.every(p=>p.features.filter(f=>f.kind==='slab'&&f.checkPass!==undefined).every(f=>f.checkPass)));
assert.ok(d.plans.every(p=>p.nodes.filter(n=>n.hangingRectangle).every(n=>Math.hypot(n.at[0]-n.hangingRectangle.at[0],n.at[1]-n.hangingRectangle.at[1])<.001)));
const pairs=new Map();for(const p of d.plans)for(const n of p.nodes)if(n.shared){if(!pairs.has(n.pairId))pairs.set(n.pairId,[]);pairs.get(n.pairId).push(n.at.slice(0,2));}for(const [id,p] of pairs){assert.equal(p.length,2);assert.deepEqual(p[0],p[1]);}assert.equal(pairs.size,d.pairedCoordinates);
for(const p of d.plans)for(const g of p.beamGroups.filter(g=>g.axis.type==='arc'&&g.limit)){assert.ok(g.anchors.some(a=>a.reason==='圆弧半弧位置'));assert.ok(Math.abs(g.axis.length-Math.abs(g.axis.sweep)*g.axis.radius)<.001);}
const need=requirements(d,3600),blocked=calculate(d,{height:3600,manual:{}});assert.ok(need.length>0);assert.equal(blocked.blocked,true);assert.equal(blocked.plans.reduce((s,p)=>s+p.nodes.length,0),0);
const changed=calculate(d,{height:3000,origin:[13925,8100],manual:{}});assert.equal(changed.blocked,false);assert.notDeepEqual(changed.plans[0].nodes.map(n=>n.at),d.plans[0].nodes.map(n=>n.at));
const report={passed:true,yangFormulaExamples:[190,220,200],registeredInputs:true,allDefaultNodesNativeFacePassed:true,allDefaultFloorCoveragePassed:true,actualHangingRectangleCenters:true,sharedPairs:pairs.size,arcCenterlineLengthAndHalfPoint:true,height3600RequiredGroups:need.length,missingRulesStopCalculation:true,baselineActuallyChangesCoordinates:true,defaultNodes:d.plans.map(p=>p.nodes.length)};fs.writeFileSync('outputs/问题1_计算规则校核.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
