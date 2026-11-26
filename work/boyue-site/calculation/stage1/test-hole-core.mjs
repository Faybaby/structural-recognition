import assert from 'node:assert/strict';
import {isLargeHole,offsetAxis,splitHoleSpan,edgeFill,holeLayout} from '../../stage1/hole-core.js';
assert(isLargeHole({width:1000,length:800}));assert(isLargeHole({width:800,length:1000}));assert(!isLargeHole({width:1000,length:799}));assert(!isLargeHole({width:999,length:999}));
assert.equal(offsetAxis(1000,-1),900);assert.equal(offsetAxis(2010,1),2100);assert.equal(offsetAxis(580,-1),500);
assert.deepEqual(splitHoleSpan(0,1350,1200),[0,700,1350]);assert.deepEqual(edgeFill(0,1900,1200),[1200]);assert.deepEqual(edgeFill(0,1200,1200),[]);
for(const span of [1300,1350,1900,2700,3900]){const points=[0,...edgeFill(0,span,1200)];assert(points.slice(1).every((v,i)=>v-points[i]<=1200));assert(span-points.at(-1)>=500);assert(span-points.at(-1)<=1200);}
const hole={id:'H',local:[[1450,1450],[2450,1450],[2450,2450],[1450,2450]]},layout=holeLayout(hole,1200,1200,()=>[[0,6450]]);assert(!layout.error);assert(layout.offsets.every(v=>v>=80&&v<=140));assert(layout.nodes.every(n=>n.u%50===0&&n.v%50===0));
const close={id:'H',local:[[500,1000],[1500,1000],[1500,2000],[500,2000]]};assert(holeLayout(close,1200,1200,()=>[[0,5000]]).error.includes('小于500'));
const exception=holeLayout(close,1200,1200,()=>[[0,5000]],{allowBoundaryException:true});assert(!exception.error);assert(exception.boundaryExceptions.length>0);
console.log(JSON.stringify({passed:true,checks:['1000/800双边阈值','80～140外偏且50模数','1350外围分成700/650','1900距边补点1200+700','距边不超过间距不补点','普通点保留500边距；洞周可明确允许例外']}));
