import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../model3d/vendor/three.module.js';
import {createRackThree} from '../../stage1/rack-three.js';
import {formedRackView} from '../../stage1/rack-view.js';

// Run the actual integration function, including replacement of a previous rack
// group. This catches the original bug where an asynchronous rack update hid all
// three original result groups after their checkboxes had been enabled.
const source=readFileSync(new URL('../../stage1/main.js',import.meta.url),'utf8');
const update=source.slice(source.indexOf('function updateRackThree(){'),source.indexOf('function locateRack('));
const pick=source.match(/const originalPick=([^;]+);/)[1];
const positions=['floor','gl','ordinary'].map((kind,i)=>({uid:kind,kind,layer:'L3',world:[i*900,0],top:6000,bottom:0,levels:[200,1700,3200],verticalConflict:kind==='ordinary'}));
const result={positions,poles:positions,rods:[],cells:[],changes:positions.slice(0,2).map(p=>({id:p.uid,before:[p.world[0]-50,0],after:p.world})),cancelled:[],highSupports:[],config:{diameter:48,primary:900},summary:{formed:0,partial:0,isolated:3}};
const original=JSON.stringify(result),scene=new THREE.Scene(),checkboxes=Object.fromEntries(['showFloorResults','showBeamResults','showOrdinaryResults'].map(id=>[id,{checked:true}]));
checkboxes.rackIsolationNote={};
const originalGroups=positions.map(p=>{const g=new THREE.Group();g.name=p.kind;g.add(new THREE.Mesh(new THREE.SphereGeometry(20),new THREE.MeshBasicMaterial()));scene.add(g);return g;});
const native=new THREE.Group();native.userData.instance={id:'L3'};scene.add(native);
let view;
const ctx={THREE,scene,groups:[native],baselineGroup:new THREE.Group(),selectionGroup:new THREE.Group(),supportGroup:originalGroups[0],beamGroup:originalGroups[1],ordinaryGroup:originalGroups[2],supportMeshes:['floor-pick'],beamMeshes:['gl-pick'],ordinaryMeshes:['ordinary-pick'],rackGroup:null,rackMeshes:[],rackRegionMeshes:[],rackRenderedSource:null,rackUI:{view:()=>view,setViewNote(){}},$:id=>checkboxes[id],state:{scope:'all',gap:0},scopeVisible:()=>true,formedRackView,createRackThree,data:{},centerX:0,centerZ:0,updateHud(){},dirty:false};
vm.createContext(ctx);vm.runInContext(update,ctx);
const identities=originalGroups.map(g=>g.children[0].uuid);
let cases=0;
for(const ready of [false,true])for(const gap of [0,500])for(let options=0;options<16;options++)for(let mask=0;mask<8;mask++){
 view={result:ready?result:null,aligned:!!(options&1),model:!!(options&2),moves:!!(options&4),cancelled:!!(options&8),isolate:false};ctx.state.gap=gap;
 Object.values(checkboxes).slice(0,3).forEach((c,i)=>c.checked=!!(mask&(1<<i)));
 ctx.updateRackThree();ctx.updateRackThree(); // a later update must not reverse the checkboxes
 originalGroups.forEach((g,i)=>{assert.equal(g.visible,!!(mask&(1<<i)));assert.equal(g.children[0].uuid,identities[i]);assert(scene.children.includes(g));});
 const picked=vm.runInContext(pick,ctx);assert.equal(picked.length,[0,1,2].filter(i=>mask&(1<<i)).length);
 if(ready&&gap===0&&!view.aligned&&view.model)assert(ctx.rackMeshes.length>0,'rack model is independent of the aligned-point display');
 cases++;
}
view={result,isolate:true,aligned:true,model:true};ctx.state.gap=0;ctx.updateRackThree();assert(originalGroups.every(g=>!g.visible));assert.equal(vm.runInContext(pick,ctx).length,0);
view.isolate=false;Object.values(checkboxes).slice(0,3).forEach(c=>c.checked=true);ctx.updateRackThree();assert(originalGroups.every(g=>g.visible));
assert.equal(JSON.stringify(result),original,'display updates must not mutate calculation results');
const overlay=createRackThree({THREE,result,view:{aligned:true,model:false},scope:'all',centerX:0,centerZ:0,visibleKinds:{floor:true,gl:false,ordinary:false}});
assert.equal(overlay.meshes.length,1);assert.equal(overlay.meshes[0].count,1);assert.equal(overlay.meshes[0].material.depthTest,false,'aligned comparison dots must remain visible through the slab');
const unchanged=createRackThree({THREE,result:{...result,changes:[],positions:positions.map(p=>({...p,verticalConflict:false}))},view:{aligned:true,model:false},scope:'all',centerX:0,centerZ:0,visibleKinds:{floor:true,gl:true,ordinary:true}});
assert.equal(unchanged.meshes.length,0,'unchanged original points must not be replaced or duplicated');
console.log(`PASS: ${cases} display combinations; original points, grid/length meshes, picking, model independence, isolation restoration and immutable calculations`);
