import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../model3d/vendor/three.module.js';
import {createRackThree} from '../../stage1/rack-three.js';
import {formedRackView,rackPointInScope} from '../../stage1/rack-view.js';

const positions=['a','b','c','d','e','f'].map((uid,i)=>({uid,kind:'floor',layer:i===2||i===3?'L4':'L3',landing:{layer:i===2||i===3?'L3':'L1'},world:[(i%2)*900,Math.floor(i/2)*900],top:i===2||i===3?11800:8800,bottom:3000,levels:[3200,4700,6200],verticalConflict:true}));
const rods=[{a:'a',b:'b',level:6200,size:900},{a:'c',b:'d',level:6200,size:900},{a:'a',b:'c',level:6200,size:900}];
const result={positions,poles:positions,rods,cells:[{id:'C1',vertices:['a','b','f','e'],level:6200},{id:'C2',vertices:['a','b','d','c'],level:6200}],changes:positions.map(p=>({id:p.uid,before:p.world,after:p.world})),cancelled:[{a:'a',b:'c',level:6200}],highSupports:[],config:{diameter:48,primary:900}};
const before=JSON.stringify(result);
const view={aligned:true,model:true,moves:true,cancelled:true,selected:'c'};
function render(scope,extra={}){return createRackThree({THREE,result,view:{...view,...extra},scope,centerX:0,centerZ:0,visibleKinds:{floor:true}});}
assert(!rackPointInScope(positions[2],'L3'),'a receiver in L3 does not make an L4 source an L3 support');
const third=render('L3');
assert(third.meshes.every(m=>m.userData.records.every(r=>['a','b','e','f'].includes(r.uid))));
const cylinders=third.meshes.filter(m=>m.geometry.type==='CylinderGeometry');
assert.deepEqual(cylinders.map(m=>m.count),[4,1],'four L3 poles and only the L3-to-L3 rod');
assert.equal(third.group.children.filter(c=>c.type==='Line').length,4,'no foreign move, cancelled cross-layer rod or foreign selection line');
assert.equal(render('all').meshes.filter(m=>m.geometry.type==='CylinderGeometry').at(-1).count,3,'four-floor view retains all rods');
assert.equal(formedRackView(result,'L3').cells.length,1,'mixed-source cells do not leak into isolated single-floor view');
assert.equal(formedRackView(result,'all').cells.length,2);
assert.equal(positions[0].bottom,3000,'the real cross-floor receiver is not clipped to the selected floor');
assert.equal(JSON.stringify(result),before);
if(process.argv[2]){
 const real=JSON.parse(readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
 const shown=createRackThree({THREE,result:real,view,scope:'L3',centerX:0,centerZ:0,visibleKinds:{floor:true,gl:true,ordinary:true}});
 const source=new Map(real.positions.map(p=>[p.uid,p]));
 assert(shown.meshes.every(m=>m.userData.records.every(r=>source.get(r.uid)?.layer==='L3')));
 console.log('PASS: project L3 mesh records contain only L3 source supports');
}
console.log('PASS: strict source-layer scope for dots, poles, rods, isolation, selection and cancelled overlays; cross-floor lengths unchanged');
