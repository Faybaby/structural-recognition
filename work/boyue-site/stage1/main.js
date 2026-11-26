import {createWorkbenchLayout} from './workbench-layout.js';
import {formedRackView,uniformRackView} from './rack-view.js';
import * as THREE from '../model3d/vendor/three.module.js';
import {OrbitControls} from '../model3d/vendor/OrbitControls.js';
import {createBaselineController} from './baseline.js';
import {createFloorController} from './floor-ui.js';
import floorInput from './projects/hangzhou/floor-input.json';
import {regionContains} from './floor-core.js';
import {createBeamController} from './beam-ui.js';
import beamInput from './projects/hangzhou/beam-input.json';
import proposals from './projects/hangzhou/review-proposals.json';
import {createReviewUI} from './review-ui.js';
import ordinaryInput from './projects/hangzhou/ordinary-input.json';
import {createOrdinaryController} from './ordinary-ui.js';
import {beamPoint,beamSourceAt} from './ordinary-core.js';
import partitionInput from './projects/hangzhou/partition-input.json';
import {applyPartition} from './partition-core.js';
import landingInput from './projects/hangzhou/landing-input.json';
import {createRackController} from './rack-ui.js';
import {createRackThree} from './rack-three.js';

const originalHTML='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
const data=JSON.parse(document.getElementById('stage-data').textContent);
applyPartition(data,floorInput,partitionInput);
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=0)=>n==null?'待确认':Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d});
const names={slab:'板下区域',beam:'梁下区域',gl:'GL标注范围','stair-edge':'楼梯阳线150',excluded:'楼梯排除 · 不计算',unmatched:'三维待核实面',drawing:'二维梁待核对'};
const colors={slab:0x419bea,beam:0xf28a32,gl:0x9562c4,'stair-edge':0x10b981,excluded:0x929b97,unmatched:0xd95759,drawing:0xd95759};
const plans=Object.fromEntries(data.plans.map(p=>[p.key,p]));
const state={scope:data.instances.length===1?data.instances[0].id:'all',gap:0,opacity:.75,projection:'all',kind:'all',search:'',page:0,selected:null,camera:'iso',selectedLength:null};
const rows=data.instances.flatMap(instance=>{
 const p=plans[instance.key];
 return [...p.zones,...p.unmatched,...(p.specialZones||[]),...(p.excluded||[]),...p.twoDReview.map((r,i)=>({...r,id:p.key+'-D'+(i+1),kind:'drawing',status:r.reason}))].map(zone=>({id:instance.id+' / '+zone.id,instance,plan:p,zone}));
});
function save(name,body,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
$('inputFiles').innerHTML=data.inputs.map(f=>`${escape(f.path.split(/[\\/]/).pop())} <small>SHA256 ${escape(f.sha256.slice(0,12))}…</small>`).join('<br>');
if(data.inputSnapshotStatus&&!data.inputSnapshotStatus.liveInputsUnchanged)$('inputFiles').insertAdjacentHTML('beforeend',`<p class="note" style="color:#9f682f;margin-top:6px">${escape(data.inputSnapshotStatus.message.replace('本次仅修正分类','本次在已载入模型上更新识别与支撑计算'))}</p>`);
$('layerCards').innerHTML=[...data.instances].reverse().map(i=>`<div class="layer" data-layer="${i.id}"><b>${i.label}</b><p>${i.wallType}<br>${i.floorType}</p><small>模型主楼面：${fmt(i.displayMainLevel)} mm</small></div>`).join('');
$('hud').innerHTML='<b>'+escape(data.plans[0].floorType)+'</b><br>STEP 实体与 DWG 投影<br>点位待计算';

let scene,renderer,camera,controls,dirty=true,groups=[],regionMeshes=[],nativeMaterials=[],selectionGroup,centerX,centerZ,baselineUI,baselineGroup,floorUI,floorResult,supportGroup,supportMeshes=[],beamUI,beamResult,beamGroup,beamMeshes=[],reviewUI;
let ordinaryUI,ordinaryResult,ordinaryGroup,ordinaryMeshes=[],rackUI,rackGroup,rackMeshes=[],rackRegionMeshes=[];
const initialBox=data.plans[0].sourceBox;centerX=(initialBox[0]+initialBox[3])/2;centerZ=(initialBox[2]+initialBox[5])/2;
reviewUI=createReviewUI({data,proposals,ordinaryGroups:ordinaryInput.groups,onVisibility:()=>{filterMeshes();updateBaselineThree();updateFloorThree();updateBeamThree();updateOrdinaryThree();highlight();},onProposal:locateProposal});
function locateProposal(proposal){
 const instance=data.instances.find(i=>i.key===proposal.key),p=plans[proposal.key],zone=p.zones.find(z=>z.id===proposal.members[0]);state.scope=instance.id;syncGroups();if(zone)select(rows.find(r=>r.instance.id===instance.id&&r.zone===zone),false);state.selectedProposal=proposal.id;reviewUI.showProposal(proposal);highlight();focus({instance,plan:p,zone:{region:proposal.region,bottom:proposal.dominantBottom}});$('viewer').scrollIntoView({behavior:'smooth',block:'start'});
}
function updateBaselineThree(){
 if(!scene||!baselineUI)return;
 if(baselineGroup){baselineGroup.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});scene.remove(baselineGroup);}
 baselineGroup=new THREE.Group();baselineGroup.name='BP-reference-points';scene.add(baselineGroup);if(!$('showBaselines').checked){dirty=true;return;}
 function line(points,color,dashed=false){const material=dashed?new THREE.LineDashedMaterial({color,depthTest:false,dashSize:90,gapSize:55,transparent:true,opacity:.95}):new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:1});const o=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material);if(dashed)o.computeLineDistances();o.renderOrder=20;baselineGroup.add(o);}
 for(const marker of baselineUI.markers()){
  const editor=baselineUI.getEditor(),selectedFloor=state.selected?.zone.kind==='slab'?state.selected.plan.key+'/'+state.selected.zone.id:null;
  if(marker.kind==='floor'&&!(editor.scope==='floor'&&editor.floorId===marker.id)&&selectedFloor!==marker.id)continue;
  const positions=[];
  for(const instance of data.instances){
   if(!scopeVisible(instance)||(marker.kind==='floor'&&marker.floor.plan.key!==instance.key))continue;
   const p=plans[instance.key],h=(marker.kind==='floor'?marker.floor.zone.bottom:p.level)-p.base+instance.offset+(instance.order-1)*state.gap+12;
   const at=new THREE.Vector3(marker.origin[0]-centerX,h,-marker.origin[1]-centerZ);positions.push(at);
   const a=marker.angleDeg*Math.PI/180,u=new THREE.Vector3(Math.cos(a),0,-Math.sin(a)),v=new THREE.Vector3(-Math.sin(a),0,-Math.cos(a)),color=marker.draft?0xef6aa5:0xdb3d8c;
   line([at.clone().addScaledVector(u,-320),at.clone().addScaledVector(u,700)],color,true);line([at.clone().addScaledVector(v,-320),at.clone().addScaledVector(v,700)],color,true);
   line(Array.from({length:41},(_,i)=>new THREE.Vector3(at.x+100*Math.cos(i*Math.PI/20),h,at.z+100*Math.sin(i*Math.PI/20))),color);
   const canvas=document.createElement('canvas');canvas.width=430;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffffeb';ctx.fillRect(0,0,430,80);ctx.fillStyle=marker.draft?'#be4a80':'#aa296c';ctx.font='bold 32px sans-serif';ctx.fillText((marker.draft?'BP草稿':'BP')+' · '+(marker.kind==='global'?instance.id:marker.floor.zone.id),12,52);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.scale.set(1300,242,1);sprite.position.copy(at).add(new THREE.Vector3(530,110,0));sprite.renderOrder=21;sprite.visible=$('showTextLabels').checked;baselineGroup.add(sprite);
  }
  if(marker.kind==='global'&&positions.length>1)line(positions,0xdb3d8c,true);
 }
 dirty=true;
}
function adjustedOwner(kind,id,layer){const v=rackUI?.view();return !!v?.uniform&&v.result.uniformAudit.some(a=>a.kind===kind&&a.id===id&&a.layer===layer);}
let rackRenderedSource=null;
function updateFloorThree(){
 queueMicrotask(updateRackThree);
 updateHud();
 if(!scene)return;
 if(supportGroup){supportGroup.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});scene.remove(supportGroup);}
 supportGroup=new THREE.Group();supportGroup.name='Floor-GD-support-points';scene.add(supportGroup);supportMeshes=[];
 if(!floorResult||!$('showFloorResults').checked){dirty=true;return;}
 if($('showSupportLengths').checked)for(const rec of floorResult.landings?.points||[]){
  const instance=data.instances.find(i=>i.id===rec.layer);if(!scopeVisible(instance)||rec.status!=='found'||adjustedOwner('floor',rec.floorId,rec.layer))continue;
  const landingInstance=data.instances.find(i=>i.id===rec.landing.layer),x=rec.world[0]-centerX,z=-rec.world[1]-centerZ,from=rec.startHeight+(instance.order-1)*state.gap,to=rec.landing.height+(landingInstance.order-1)*state.gap;
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,from,z),new THREE.Vector3(x,to,z)]),new THREE.LineBasicMaterial({color:rec.id===state.selectedLength?0x6100c9:0x8024d5,depthTest:false,transparent:true,opacity:rec.id===state.selectedLength?1:state.selectedLength?0.09:0.45}));line.renderOrder=13;supportGroup.add(line);
  if(rec.id===state.selectedLength){
   for(const y of [from,to]){const dot=new THREE.Mesh(new THREE.SphereGeometry(80,12,8),new THREE.MeshBasicMaterial({color:0x8024d5,depthTest:false,transparent:true}));dot.position.set(x,y,z);dot.renderOrder=15;supportGroup.add(dot);}
   const canvas=document.createElement('canvas');canvas.width=650;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#fffffff5';ctx.fillRect(0,0,650,100);ctx.fillStyle='#7028a4';ctx.font='bold 44px sans-serif';ctx.fillText(`${rec.crossLayer?'跨层 ':''}${fmt(rec.length,1)} mm · ${rec.layer} → ${rec.landing.layer}`,15,62);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));label.position.set(x+1150,(from+to)/2,z);label.scale.set(3600,554,1);label.renderOrder=22;label.visible=$('showTextLabels').checked;supportGroup.add(label);
  }
 }
 for(const instance of data.instances){
  if(!scopeVisible(instance))continue;const p=plans[instance.key],records=[];
  for(const result of floorResult.floors.filter(r=>r.key===instance.key&&r.status==='passed'&&!adjustedOwner('floor',r.id,instance.id))){
   const floor=floorUI.getFloor(result.id);for(const point of result.nodes)if($(point.origin==='洞周外围'?'showFloorHole':'showFloorOrdinary').checked)records.push({point,result,floor,instance});
   if($('showFloorGrid').checked){const vertices=[];for(const segment of result.gridSegments){for(const q of segment){const h=floor.members.find(m=>regionContains(q,m.region))?.bottom??Math.min(...floor.members.map(m=>m.bottom));vertices.push(q[0]-centerX,h-p.base+instance.offset+(instance.order-1)*state.gap-12,-q[1]-centerZ);}}if(vertices.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xa34db4,depthTest:false,transparent:true,opacity:.8}));line.renderOrder=10;supportGroup.add(line);}}
  }
  if(records.length&&$('showFloorSupports').checked){const mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(58,10,7),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false,transparent:true,opacity:1}),records.length);const matrix=new THREE.Matrix4();records.forEach((rec,i)=>{const n=rec.point;matrix.makeTranslation(n.world[0]-centerX,n.sourceHeight-p.base+instance.offset+(instance.order-1)*state.gap-8,-n.world[1]-centerZ);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new THREE.Color(n.origin==='洞周外围'?0xd68726:0x173c62));});if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;mesh.userData.records=records;mesh.renderOrder=12;supportGroup.add(mesh);supportMeshes.push(mesh);}
 }
 dirty=true;
}
function showLandingPoint(rec){
 if(!rec)return;state.selectedLength=rec.id;floorUI.selectFloor(rec.floorId,false);const instance=data.instances.find(i=>i.id===rec.layer),floor=floorUI.getFloor(rec.floorId),zone=plans[instance.key].zones.find(z=>z.id===floor.memberIds[0]);state.scope=rec.crossLayer?'all':instance.id;syncGroups();if(zone)select(rows.find(r=>r.instance.id===instance.id&&r.zone===zone),false);
 $('selection').insertAdjacentHTML('afterbegin',`<div class="formula"><b>楼面固顶中心位置 ${escape(rec.id)}</b><br>X=${fmt(rec.world[0],3)}，Y=${fmt(rec.world[1],3)}mm<br>固顶承托标高 ${fmt(rec.startHeight,1)}mm<br>${rec.status==='found'?`承接面 ${rec.landing.layer} · ${escape(rec.landing.face)}<br>承接标高 ${fmt(rec.landing.height,1)}mm<br><b style="color:#8024d5">紫色竖线长度 ${fmt(rec.length,1)}mm${rec.crossLayer?' · 跨层':''}</b><br>${rec.skippedLayers.length?'跳过无承接面的 '+rec.skippedLayers.join('、')+'，继续查下一层。':'最近下方实际实体顶面。'}`:'当前输入内未找到承接面，长度待确认。'}<br>几何长度未扣除固顶、底座构造尺寸。</div>`);
 if(camera){state.camera='iso';fit();const to=rec.landing?rec.landing.height:rec.startHeight,mid=(rec.startHeight+to)/2,c=new THREE.Vector3(rec.world[0]-centerX,mid,-rec.world[1]-centerZ);camera.position.add(c.clone().sub(controls.target));controls.target.copy(c);camera.userData.half=Math.max(4200,rec.length*.8||4200);camera.zoom=1;controls.update();resize();dirty=true;}reviewUI.showPoint(rec,'楼面固顶位置');$('viewer').scrollIntoView({behavior:'smooth',block:'start'});
}
function updateBeamThree(){
 queueMicrotask(updateRackThree);
 if(!scene)return;
 if(beamGroup){beamGroup.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});scene.remove(beamGroup);}
 beamGroup=new THREE.Group();scene.add(beamGroup);beamMeshes=[];
 if(!beamResult||!$('showBeamResults').checked){dirty=true;return;}
 for(const i of data.instances){if(!scopeVisible(i))continue;const p=plans[i.key],records=[];
  for(const beam of beamResult.beams.filter(b=>b.key===i.key&&b.status==='passed'&&!adjustedOwner('gl',b.id,i.id))){
   for(const point of beam.nodes)if($(point.origin==='阳线端部'?'showBeamEnds':'showBeamInterior').checked)records.push({beam,point,instance:i,kind:'beam'});
   if($('showBeamGrid').checked&&beam.nodes.length>1){const points=beam.nodes.map(n=>new THREE.Vector3(n.world[0]-centerX,n.sourceHeight-p.base+i.offset+(i.order-1)*state.gap-14,-n.world[1]-centerZ));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xbd4f97,depthTest:false}));line.renderOrder=11;beamGroup.add(line);}
  }
  if(records.length&&$('showBeamSupports').checked){const mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(48,12,8),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true}),records.length),matrix=new THREE.Matrix4();records.forEach((r,k)=>{matrix.makeTranslation(r.point.world[0]-centerX,r.point.sourceHeight-p.base+i.offset+(i.order-1)*state.gap-8,-r.point.world[1]-centerZ);mesh.setMatrixAt(k,matrix);mesh.setColorAt(k,new THREE.Color(r.point.origin==='阳线端部'?0xd44868:0xa85d20));});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.userData.records=records;mesh.renderOrder=17;beamGroup.add(mesh);beamMeshes.push(mesh);}
 }
 if($('showBeamLengths').checked)for(const rec of beamResult.landings.points){const i=data.instances.find(i=>i.id===rec.layer);if(!scopeVisible(i)||rec.status!=='found'||adjustedOwner('gl',rec.floorId,rec.layer))continue;const lower=data.instances.find(i=>i.id===rec.landing.layer),x=rec.world[0]-centerX,z=-rec.world[1]-centerZ,from=rec.startHeight+(i.order-1)*state.gap,to=rec.landing.height+(lower.order-1)*state.gap,selected=rec.id===state.selectedBeamLength;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,from,z),new THREE.Vector3(x,to,z)]),new THREE.LineBasicMaterial({color:0x8024d5,depthTest:false,transparent:true,opacity:selected?1:state.selectedBeamLength ? .12 : .5}));line.renderOrder=15;beamGroup.add(line);if(selected){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#fffffff5';ctx.fillRect(0,0,640,100);ctx.fillStyle='#7028a4';ctx.font='bold 42px sans-serif';ctx.fillText(`GL ${fmt(rec.length,1)}mm · ${rec.layer} → ${rec.landing.layer}`,12,62);const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.position.set(x+1000,(from+to)/2,z);sprite.scale.set(2000,312,1);sprite.renderOrder=22;sprite.visible=$('showTextLabels').checked;beamGroup.add(sprite);}}
 dirty=true;updateHud();
}
function locateBeam(beam,rec=null){
 if(!camera)return;beamUI.selectBeam(beam.id);const instance=rec?data.instances.find(i=>i.id===rec.layer):(data.instances.find(i=>i.key===beam.key&&scopeVisible(i))||data.instances.find(i=>i.key===beam.key)),p=plans[beam.key],zone=p.zones.find(z=>z.id===beam.memberIds[0]);state.scope=rec?.landing?'all':instance.id;state.selectedBeamLength=rec?.id||null;syncGroups();if(zone)select(rows.find(r=>r.instance.id===instance.id&&r.zone===zone),false);
 $('selection').insertAdjacentHTML('afterbegin',`<div class="formula" style="border-color:#d44868"><b>挂梁 ${escape(beam.id)} · 固顶位置</b><br>${escape(beam.mode||beam.reasons.join('；'))}<br>实体梁宽×GL高 ${fmt(beam.width)}×${fmt(beam.height)}mm<br>查表 ${beam.index?beam.index.width+'×'+beam.index.height+'，XX='+beam.index.spacing+'mm':'待处理'}<br>${rec?`支撑X/Y ${rec.world.map(v=>fmt(v,3)).join(' / ')}mm<br>${rec.status==='found'?'至'+rec.landing.layer+'承接面 '+fmt(rec.length,1)+'mm'+(rec.crossLayer?' · 跨层':''):'承接面长度待确认'}`:'点位及分步计算见挂梁计算区。'}</div>`);
 if(rec)reviewUI.showPoint(rec,'挂梁固顶位置');focus({instance,plan:p,zone:{region:beam.region,bottom:beam.bottom}});if(rec?.status==='found'){const lower=data.instances.find(i=>i.id===rec.landing.layer),from=rec.startHeight+(instance.order-1)*state.gap,to=rec.landing.height+(lower.order-1)*state.gap,target=new THREE.Vector3(rec.world[0]-centerX,(from+to)/2,-rec.world[1]-centerZ);camera.position.add(target.clone().sub(controls.target));controls.target.copy(target);camera.userData.half=Math.max(1600,Math.abs(from-to)*.8);camera.zoom=1;controls.update();resize();dirty=true;}rackUI?.inspectOwner('gl',beam.id,instance.id);$('viewer').scrollIntoView({block:'start',behavior:'smooth'});
}
function updateOrdinaryThree(){
 queueMicrotask(updateRackThree);
 if(!scene)return;
 if(ordinaryGroup){ordinaryGroup.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});scene.remove(ordinaryGroup);}
 ordinaryGroup=new THREE.Group();ordinaryGroup.name='Ordinary-beam-center-positions';scene.add(ordinaryGroup);ordinaryMeshes=[];
 if(!ordinaryResult||!$('showOrdinaryResults').checked){dirty=true;updateHud();return;}
 for(const i of data.instances){if(!scopeVisible(i))continue;const plan=plans[i.key],records=[];
  for(const point of ordinaryResult.points.filter(n=>n.key===i.key&&!ordinaryResult.beams.some(b=>b.nodes.some(p=>p.id===n.id)&&adjustedOwner('ordinary',b.id,i.id))))if($(point.origin==='梁梁交点'?'showOrdinaryJunctionPoints':'showOrdinarySpanPoints').checked){const beam=ordinaryResult.beams.find(b=>b.status==='passed'&&b.nodes.some(n=>n.id===point.id));records.push({point,beam,instance:i,kind:'ordinary'});}
  if(records.length){const mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(45,10,7),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true}),records.length),matrix=new THREE.Matrix4();records.forEach((r,k)=>{matrix.makeTranslation(r.point.world[0]-centerX,r.point.sourceHeight-plan.base+i.offset+(i.order-1)*state.gap-8,-r.point.world[1]-centerZ);mesh.setMatrixAt(k,matrix);mesh.setColorAt(k,new THREE.Color(r.point.junctionModulusException&&$('showOrdinaryExceptions').checked?0xc235a1:r.point.origin==='梁梁交点'?0x009da8:r.point.origin==='阳线端部'?0xdc822e:0x12645e));});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.userData.records=records;mesh.renderOrder=18;ordinaryGroup.add(mesh);ordinaryMeshes.push(mesh);}
  if($('showOrdinaryExceptions').checked&&$('showTextLabels').checked)for(const r of records.filter(r=>r.point.junctionModulusException)){
   const canvas=document.createElement('canvas');canvas.width=800;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#fffffff2';ctx.fillRect(0,0,800,100);ctx.strokeStyle='#c235a1';ctx.lineWidth=5;ctx.strokeRect(2,2,796,96);ctx.fillStyle='#a8228b';ctx.font='bold 36px sans-serif';ctx.fillText(`交点模数例外 ${r.point.junction?.split('/').at(-1)||''} · ${fmt(r.point.modulusReview.maxDeviation,2)}mm`,12,64);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));label.position.set(r.point.world[0]-centerX+950,r.point.sourceHeight-plan.base+i.offset+(i.order-1)*state.gap+90,-r.point.world[1]-centerZ);label.scale.set(1800,225,1);label.renderOrder=23;ordinaryGroup.add(label);
  }
  if($('showOrdinaryGrid').checked)for(const b of ordinaryResult.beams.filter(b=>b.key===i.key&&!adjustedOwner('ordinary',b.id,i.id)&&!b.calculationExempt&&['passed','pending'].includes(b.status))){const samples=Math.max(1,Math.ceil(b.length/150)),vertices=[];for(let k=0;k<=samples;k++){const q=beamPoint(b.path,b.length*k/samples);vertices.push(new THREE.Vector3(q[0]-centerX,(beamSourceAt(b,q)?.bottom??b.bottom)-plan.base+i.offset+(i.order-1)*state.gap-12,-q[1]-centerZ));}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices),b.status==='passed'?new THREE.LineBasicMaterial({color:0x289b95,depthTest:false,transparent:true,opacity:.75}):new THREE.LineDashedMaterial({color:0xce8054,depthTest:false,dashSize:70,gapSize:40,transparent:true,opacity:.65}));if(b.status!=='passed')line.computeLineDistances();line.renderOrder=11;ordinaryGroup.add(line);}
  if($('showOrdinaryCuts').checked)for(const g of ordinaryInput.groups.filter(g=>g.key===i.key))for(const c of g.yinCuts||[]){const vertices=[c.start,c.end].map(q=>new THREE.Vector3(q[0]-centerX,g.bottom-plan.base+i.offset+(i.order-1)*state.gap-15,-q[1]-centerZ)),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices),new THREE.LineDashedMaterial({color:0xce4c91,depthTest:false,dashSize:70,gapSize:40}));line.computeLineDistances();line.renderOrder=13;ordinaryGroup.add(line);}
 }
 if($('showOrdinaryLengths').checked)for(const rec of ordinaryResult.landings.points){if(rec.status!=='found')continue;const i=data.instances.find(i=>i.id===rec.layer);if(!scopeVisible(i)||adjustedOwner('ordinary',rec.floorId,rec.layer))continue;const lower=data.instances.find(i=>i.id===rec.landing.layer),x=rec.world[0]-centerX,z=-rec.world[1]-centerZ,from=rec.startHeight+(i.order-1)*state.gap,to=rec.landing.height+(lower.order-1)*state.gap,selected=rec.id===state.selectedOrdinaryLength;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,from,z),new THREE.Vector3(x,to,z)]),new THREE.LineBasicMaterial({color:0x8024d5,depthTest:false,transparent:true,opacity:selected?1:state.selectedOrdinaryLength ? .12 : .35}));line.renderOrder=15;ordinaryGroup.add(line);if(selected){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#fffffff5';ctx.fillRect(0,0,640,100);ctx.fillStyle='#7028a4';ctx.font='bold 42px sans-serif';ctx.fillText(`梁 ${fmt(rec.length,1)}mm · ${rec.layer} → ${rec.landing.layer}`,12,62);const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.position.set(x+1000,(from+to)/2,z);sprite.scale.set(2000,312,1);sprite.renderOrder=22;sprite.visible=$('showTextLabels').checked;ordinaryGroup.add(sprite);}}
 dirty=true;updateHud();
}
function locateOrdinary(b,rec=null){
 if(!camera||!b)return;const i=rec?data.instances.find(i=>i.id===rec.layer):(data.instances.find(i=>i.key===b.key&&scopeVisible(i))||data.instances.find(i=>i.key===b.key)),p=plans[b.key],zone=p.zones.find(z=>z.id===b.memberIds[0]);state.scope=rec?.landing?'all':i.id;state.selectedOrdinaryLength=rec?.id||null;syncGroups();if(zone)select(rows.find(r=>r.instance.id===i.id&&r.zone===zone),false);
 if(!b.noAxis)ordinaryUI.selectBeam(b.id);else ordinaryUI.selectGroup(b.groupId||b.id);state.selectedOrdinaryGroup=b.groupId||b.id;highlight();
 focus({instance:i,plan:p,zone:{region:b.region,bottom:b.bottom}});
 if(rec){const point=ordinaryResult.points.find(n=>n.id===rec.nodeId);reviewUI.showPoint(rec,'普通梁位置'+(point?.junctionModulusException?' · 交点50mm模数例外':''));if(rec.status==='found'){const lower=data.instances.find(i=>i.id===rec.landing.layer),from=rec.startHeight+(i.order-1)*state.gap,to=rec.landing.height+(lower.order-1)*state.gap,c=new THREE.Vector3(rec.world[0]-centerX,(from+to)/2,-rec.world[1]-centerZ);camera.position.add(c.clone().sub(controls.target));controls.target.copy(c);camera.userData.half=Math.max(1800,Math.abs(from-to)*.8);controls.update();resize();}}
 rackUI?.inspectOwner('ordinary',b.id,i.id);
 $('viewer').scrollIntoView({block:'start',behavior:'smooth'});dirty=true;
}
function shapeGeometry(regions){
 const shapes=[];
 for(const r of regions||[]){
  if(r.polygon.length<3)continue;
  const shape=new THREE.Shape(r.polygon.map(([x,y])=>new THREE.Vector2(x-centerX,y+centerZ)));
  for(const h of r.holes||[])if(h.length>2)shape.holes.push(new THREE.Path(h.map(([x,y])=>new THREE.Vector2(x-centerX,y+centerZ))));
  shapes.push(shape);
 }
 return shapes.length?new THREE.ShapeGeometry(shapes):null;
}
function regionFor(zone){return state.projection==='common'?zone.commonRegion||[]:state.projection==='exclusive'?zone.exclusiveRegion||[]:zone.region||[];}
function nativeQuadGeometry(zone,p){
 const a=zone.nativeVertices,geometry=new THREE.BufferGeometry(),values=[];
 for(const index of [0,1,2,0,2,3])values.push(a[index][0]-centerX,a[index][1]-p.base,a[index][2]-centerZ);
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));geometry.computeVertexNormals();return geometry;
}
function drawRegions(){
 for(const mesh of regionMeshes){mesh.parent.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
 regionMeshes=[];
 for(const group of groups){
  const instance=group.userData.instance,p=plans[instance.key];
  for(const zone of [...p.zones,...p.unmatched,...(p.specialZones||[]),...(p.excluded||[])]){
   if(!regionFor(zone).length)continue;
   const geometry=zone.nativeVertices?nativeQuadGeometry(zone,p):shapeGeometry(regionFor(zone));if(!geometry)continue;
   if(!zone.nativeVertices&&zone.planeNormal&&zone.planeOrigin){
    const [nx,ny,nz]=zone.planeNormal,[ox,oy,oz]=zone.planeOrigin;
    if(Math.abs(nz)>.05&&(Math.abs(nx)>.00001||Math.abs(ny)>.00001)){
     const position=geometry.getAttribute('position');
     for(let v=0;v<position.count;v++){const x=position.getX(v)+centerX,y=position.getY(v)-centerZ;position.setZ(v,oz-(nx*(x-ox)+ny*(y-oy))/nz-zone.bottom);}
     geometry.computeBoundingSphere();
    }
   }
   const material=new THREE.MeshBasicMaterial({color:colors[zone.kind],side:THREE.DoubleSide,transparent:true,opacity:zone.kind==='slab'?.7:.94,depthTest:!$('through').checked,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
   const mesh=new THREE.Mesh(geometry,material);if(!zone.nativeVertices){mesh.rotation.x=-Math.PI/2;mesh.position.y=zone.bottom-p.base-1;}else mesh.position.y=-1;mesh.renderOrder=zone.kind==='stair-edge'?6:4;
   mesh.userData={row:rows.find(r=>r.instance.id===instance.id&&r.zone===zone)};
   group.add(mesh);regionMeshes.push(mesh);
  }
 }
 filterMeshes();highlight();dirty=true;
}
function matchesKind(kind,zone){return state.kind==='edge-beam'?zone.classificationRule==='USER-EDGE-DOWNSTAND-AS-BEAM-20261111':state.kind==='plane-group'?zone.groupingRule==='USER-COPLANAR-STEP-LE20-20261111':state.kind==='all'?kind!=='unmatched':state.kind===kind;}
function filterMeshes(){
 for(const mesh of regionMeshes){const z=mesh.userData.row.zone,k=z.kind,categoryOn=$({slab:'showSlabRegions',beam:'showBeamRegions',gl:'showGLRegions'}[k]||'showAreas').checked;mesh.visible=categoryOn&&$('showAreas').checked&&(state.kind==='all'||matchesKind(k,z))&&(k!=='unmatched'||$('showPending').checked)&&(k!=='excluded'||state.kind==='excluded')&&(k!=='stair-edge'||$('showYangline').checked);mesh.material.depthTest=!$('through').checked;}
 for(const group of groups)for(const child of group.children){if(child.userData.nativeModel)child.visible=$('showNativeModel').checked;if(child.userData.nativeEdges)child.visible=$('showNativeEdges').checked;}
 dirty=true;
}
function rackSources(){return floorResult&&beamResult&&ordinaryResult&&!baselineUI?.isDirty()?{floor:floorResult,gl:beamResult,ordinary:ordinaryResult}:null;}
function updateRackThree(){
 if(!scene)return;const view=rackUI?.view(),isolating=!!view?.isolate,visibleKinds={floor:$('showFloorResults').checked,gl:$('showBeamResults').checked,ordinary:$('showOrdinaryResults').checked};
 const currentSource=view?.uniform?view.result:null;if(currentSource!==rackRenderedSource){rackRenderedSource=currentSource;updateFloorThree();updateBeamThree();updateOrdinaryThree();}
 for(const g of groups)g.visible=!isolating&&scopeVisible(g.userData.instance);if(baselineGroup)baselineGroup.visible=!isolating;if(selectionGroup)selectionGroup.visible=!isolating;
 let empty=$('rackIsolationNote');if(!empty){empty=document.createElement('div');empty.id='rackIsolationNote';empty.style.cssText='position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);padding:20px;background:#fff;border:1px solid #cddbd2;border-radius:10px;z-index:5;max-width:420px;text-align:center;pointer-events:none';$('stage').append(empty);}const isolated=view?.result?(view.uniform?uniformRackView(view.result,state.scope):formedRackView(view.result,state.scope)):null,count=view?.uniform?(isolated?.uids.size||0):(isolated?.cells.length||0);empty.hidden=!isolating||count>0;empty.textContent=view?.uniform?'当前层无跃层统一对齐区域；关闭统一对齐可返回原结果。':view?.result?'当前范围暂无成井单元。':'等待盘扣计算完成。';
 // Only explicit isolation may temporarily hide original results. Alignment is an independent overlay.
 if(supportGroup)supportGroup.visible=!isolating&&visibleKinds.floor;if(beamGroup)beamGroup.visible=!isolating&&visibleKinds.gl;if(ordinaryGroup)ordinaryGroup.visible=!isolating&&visibleKinds.ordinary;
 if(rackGroup){rackGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});scene.remove(rackGroup);rackGroup=null;}rackMeshes=[];rackRegionMeshes=[];
 if(view?.result){rackUI.setViewNote(state.gap!==0?'当前分离量非0：架体暂时隐藏，避免误示实际连接。点击高支撑会恢复真实标高。':`${view.uniform?'当前调整区域使用 '+view.result.config.primary+'mm，青蓝楼面／紫色梁；未调整区域保留原方案；':'当前为原方案，使用原表间距；'}${view.result.summary.formed}条已成井、${view.result.summary.partial}条局部连接、${view.result.summary.isolated}条独立保留。模型按真实标高显示。${state.scope!=='all'?'当前只显示本层发起支撑，跨层长度保留。':''}`);
  if(state.gap===0&&(view.aligned||view.model||view.moves||view.cancelled||view.selected)){const built=createRackThree({THREE,result:view.result,view,data,scope:state.scope,centerX,centerZ,visibleKinds});rackGroup=built.group;rackMeshes=built.meshes;rackRegionMeshes=built.regionMeshes||[];scene.add(rackGroup);}
 }if(isolating&&view?.result)rackUI.setViewNote(view.uniform?'统一中心距'+view.result.config.primary+'mm；当前范围'+count+'个点，闭合单元'+isolated.cells.length+'个。只显示所属区域与周边梁板；端部／洞周例外及收口实际尺寸另列，关闭后恢复原结果。':'孤立查看：'+count+'个闭合单元。');updateHud();dirty=true;
}
function locateRack(p){if(!p||!camera)return;state.gap=0;$('gap').value=0;$('gapValue').textContent='0 mm';state.scope=p.crossLayer?'all':p.layer;state.camera='iso';syncGroups();fit();const c=new THREE.Vector3(p.world[0]-centerX,(p.top+(p.bottom??p.top))/2,-p.world[1]-centerZ);camera.position.add(c.clone().sub(controls.target));controls.target.copy(c);camera.userData.half=Math.max(1900,(p.length||3000)*.7);camera.zoom=1;controls.update();resize();dirty=true;reviewUI.showInspector('rack');$('viewer').scrollIntoView({behavior:'smooth',block:'start'});}
function isolateRack(){state.gap=0;$('gap').value=0;$('gapValue').textContent='0 mm';syncGroups();updateRackThree();if(rackGroup?.children.length){state.camera='iso';fit();}$('viewer').scrollIntoView({behavior:'smooth',block:'start'});return state.scope;}
function scopeVisible(instance){return state.scope==='all'||state.scope===instance.id;}
function updateHud(){
 const visible=data.instances.filter(scopeVisible),passed=floorResult?visible.reduce((sum,i)=>sum+floorResult.floors.filter(r=>r.key===i.key&&r.status==='passed').reduce((s,r)=>s+r.nodes.length,0),0):0,pending=floorResult?visible.reduce((sum,i)=>sum+floorResult.floors.filter(r=>r.key===i.key&&r.status==='pending').length,0):0,exempt=floorResult?visible.reduce((sum,i)=>sum+floorResult.floors.filter(r=>r.key===i.key&&r.status==='exempt').length,0):0;
 $('hud').innerHTML=`<b>${state.scope==='all'?data.sequence.join(' → '):visible[0]?.label}</b><br>${state.projection==='common'?'显示投影共同部分':state.projection==='exclusive'?'显示各模型投影独有部分':'显示全部承托区域'}<br>${floorResult?`楼面已布置 ${passed} 点 · 免放 ${exempt} 块 · 待处理 ${pending} 块<br>紫线为计算参考网格${state.selectedLength?(()=>{const p=floorResult.landings?.points.find(p=>p.id===state.selectedLength);return p?.status==='found'?`<br><b style="color:#8024d5">${p.layer} → ${p.landing.layer} · ${fmt(p.length,1)} mm${p.crossLayer?' · 跨层':''}</b>`:'';})():''}`: '楼面点位待计算或基准修改未保存'}`;
 if(!$('showFloorResults').checked)$('hud').innerHTML=$('hud').innerHTML.split('<br>').slice(0,2).join('<br>')+'<br>楼面结果已隐藏，计算独立保留';
 if(ordinaryResult){const n=ordinaryResult.landings.points.filter(p=>visible.some(i=>i.id===p.layer)).length;$('hud').innerHTML+=`<br><b style="color:#12645e">普通梁 ${n} 点${$('showOrdinaryResults').checked?'':'（已隐藏）'}</b> · ${ordinaryResult.summary.partialGroups+ordinaryResult.summary.pendingGroups}根待完整核对`;}
 if(beamResult){const beamPoints=visible.reduce((sum,i)=>sum+beamResult.beams.filter(b=>b.key===i.key).reduce((n,b)=>n+b.nodes.length,0),0);$('hud').innerHTML+=`<br><b style="color:#b03b57">挂梁 ${beamPoints} 点${$('showBeamResults').checked?'':'（已隐藏）'}</b> · ${beamResult.summary.pending} 段待处理`;}
 const rack=rackUI?.view();if(rack?.isolate){const shown=rack.uniform?uniformRackView(rack.result,state.scope):formedRackView(rack.result,state.scope);$('hud').innerHTML=rack.uniform?'<b>跃层统一间距 '+rack.result.config.primary+'mm</b><br>当前范围 '+shown.uids.size+'点／'+shown.cells.length+'个闭合单元<br>原始＞3200触发线 '+(rack.result.triggerAudit||[]).filter(t=>state.scope==='all'||t.layer===state.scope).length+'根<br>原结果独立保留；仅本层核心／邻区调整':'<b>孤立查看成井单元</b><br>'+shown.cells.length+'个闭合单元';return;}if(rack?.result)$('hud').innerHTML+=`<br><b>盘扣模型${rack.aligned?'／对齐叠加':''}：${rack.result.summary.high}条高支撑</b><br>成井${rack.result.summary.formed} · 局部${rack.result.summary.partial} · 独立${rack.result.summary.isolated}（当前模型）`;
}
function syncGroups(){
 for(const group of groups){const i=group.userData.instance;group.visible=scopeVisible(i);group.position.y=i.offset+(i.order-1)*state.gap;}
 for(const button of document.querySelectorAll('[data-scope]'))button.setAttribute('aria-pressed',button.dataset.scope===state.scope);
 updateHud();
 updateBaselineThree();
 updateFloorThree();
 updateBeamThree();
 updateOrdinaryThree();
 dirty=true;
}
function viewBox(){
 const b=new THREE.Box3();if(rackUI?.view().isolate&&rackGroup?.children.length)return b.setFromObject(rackGroup);
 for(const g of groups)if(g.visible){const i=g.userData.instance,p=plans[i.key],q=p.sourceBox;b.expandByPoint(new THREE.Vector3(q[0]-centerX,q[1]-p.base+g.position.y,q[2]-centerZ));b.expandByPoint(new THREE.Vector3(q[3]-centerX,q[4]-p.base+g.position.y,q[5]-centerZ));}
 if(b.isEmpty())for(const i of data.instances){const p=plans[i.key],q=p.sourceBox;b.expandByPoint(new THREE.Vector3(q[0]-centerX,q[1]-p.base+i.offset,q[2]-centerZ));b.expandByPoint(new THREE.Vector3(q[3]-centerX,q[4]-p.base+i.offset,q[5]-centerZ));}return b;
}
function resize(){
 if(!renderer)return;
 const w=$('stage').clientWidth,h=$('stage').clientHeight;
 if(w<2||h<2)return;
 if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);dirty=true;}
 const half=camera.userData.half||14000;camera.left=-half*w/h;camera.right=half*w/h;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
}
function fit(){
 if(!camera)return;
 const box=viewBox(),c=box.getCenter(new THREE.Vector3()),radius=box.getSize(new THREE.Vector3()).length()/2;
 const deltas={iso:[.55,.65,1],bottom:[.5,-.75,1],top:[0,1,.0001]};
 const delta=new THREE.Vector3(...deltas[state.camera]).normalize().multiplyScalar(radius*3);
 controls.target.copy(c);camera.position.copy(c).add(delta);camera.up.set(0,1,0);camera.lookAt(c);camera.zoom=1;controls.update();
 const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z));
 camera.updateMatrixWorld();const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);let mx=1,my=1;
 for(const pt of corners){pt.sub(c);mx=Math.max(mx,Math.abs(pt.dot(right)));my=Math.max(my,Math.abs(pt.dot(up)));}
 const ratio=Math.max(.5,$('stage').clientWidth/Math.max(1,$('stage').clientHeight));camera.userData.half=Math.max(my,mx/ratio)*1.12;resize();dirty=true;
}
function highlight(){
 if(!selectionGroup)return;
 for(const child of [...selectionGroup.children]){child.geometry.dispose();child.material.dispose();selectionGroup.remove(child);}
 const row=state.selected;if(!row||!scopeVisible(row.instance))return;
 const proposal=state.selectedProposal&&$('showProposalMarkers').checked?proposals.rows.find(p=>p.id===state.selectedProposal):null;
 if(!proposal&&!$('showSelection').checked){dirty=true;return;}
 const nativeGroup=state.selectedOrdinaryGroup?ordinaryInput.groups.find(g=>g.id===state.selectedOrdinaryGroup):null;
 const selectedZones=nativeGroup?ordinaryInput.sources.filter(s=>s.groupId===nativeGroup.id):proposal?row.plan.zones.filter(z=>proposal.members.includes(z.id)):[row.zone],color=proposal||nativeGroup?0x00a0a5:0xd86a37;
 for(const zone of selectedZones){const regions=nativeGroup?zone.region:regionFor(zone),y=(zone.bottom??row.plan.level)-row.plan.base+row.instance.offset+(row.instance.order-1)*state.gap-3;
 if(zone.nativeVertices){const points=[...zone.nativeVertices,zone.nativeVertices[0]].map(v=>new THREE.Vector3(v[0]-centerX,v[1]-row.plan.base+row.instance.offset+(row.instance.order-1)*state.gap-2,v[2]-centerZ));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,depthTest:false}));line.renderOrder=9;selectionGroup.add(line);continue;}
 for(const r of regions)for(const path of [r.polygon,...(r.holes||[])]){if(!path.length)continue;const pts=[...path,path[0]].map(([x,z])=>new THREE.Vector3(x-centerX,y,-z-centerZ));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true}));line.renderOrder=9;selectionGroup.add(line);}}
 dirty=true;
}
function setup(){
 renderer=new THREE.WebGLRenderer({canvas:$('canvas'),antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0xedf2f0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-25000,25000,15000,-15000,1,300000);controls=new OrbitControls(camera,$('canvas'));controls.enableDamping=false;controls.screenSpacePanning=true;controls.minZoom=.25;controls.maxZoom=100;
 controls.addEventListener('change',()=>{dirty=true;});
 scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-20000,30000,40000);scene.add(light);const fill=new THREE.DirectionalLight(0xc6d7df,1.3);fill.position.set(10000,-20000,-30000);scene.add(fill);
 for(const instance of data.instances){
  const p=plans[instance.key],g=new THREE.Group();g.userData.instance=instance;groups.push(g);scene.add(g);
  for(const mesh of p.meshes){
   const bytes=Uint8Array.from(atob(mesh.positions),c=>c.charCodeAt(0)),positions=new Float32Array(bytes.buffer);
   for(let k=0;k<positions.length;k+=3){positions[k]-=centerX;positions[k+1]-=p.base;positions[k+2]-=centerZ;}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.computeVertexNormals();geo.computeBoundingSphere();
   const mat=new THREE.MeshStandardMaterial({color:0xe9ece8,roughness:.82,metalness:0,side:THREE.DoubleSide,transparent:true,opacity:state.opacity,depthWrite:true});nativeMaterials.push(mat);
   const native=new THREE.Mesh(geo,mat);native.userData.nativeModel=true;g.add(native);
   const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geo,24),new THREE.LineBasicMaterial({color:0x4d5a55,transparent:true,opacity:.32}));edge.renderOrder=1;edge.userData.nativeEdges=true;g.add(edge);
  }
 }
 selectionGroup=new THREE.Group();scene.add(selectionGroup);drawRegions();syncGroups();fit();
 new ResizeObserver(()=>{resize();dirty=true;}).observe($('stage'));
 let down; $('canvas').addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
 $('canvas').addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5||e.button!==0)return;
  const rect=$('canvas').getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  scene.updateMatrixWorld();
  if(baselineUI?.isPickingThree()){
   const hit=ray.intersectObjects(regionMeshes.filter(m=>m.visible&&m.parent.visible&&m.userData.row.zone.kind==='slab'))[0];
   if(hit){const row=hit.object.userData.row;baselineUI.pickThree({point:[hit.point.x+centerX,-hit.point.z-centerZ],floorId:row.plan.key+'/'+row.zone.id,tolerance:camera.userData.half*2/$('stage').clientHeight*12});}
   return;
  }
  const originalPick=[...(ordinaryGroup?.visible?ordinaryMeshes:[]),...(beamGroup?.visible?beamMeshes:[]),...(supportGroup?.visible?supportMeshes:[])];const pointHit=ray.intersectObjects([...rackMeshes,...rackRegionMeshes,...originalPick])[0];if(pointHit){if(pointHit.object.userData.rackRegion){const r=pointHit.object.userData.rackRegion;rackUI.inspectOwner(r.kind,r.id,r.layer);return;}const rec=pointHit.object.userData.records[pointHit.instanceId];if(rec.kind==='rack-trigger'){rackUI.inspectTrigger(rec.uid);return;}if(rec.kind==='rack'){rackUI.inspect(rec.uid);return;}if(rec.kind==='ordinary')locateOrdinary(rec.beam,ordinaryResult.landings.points.find(p=>p.id===rec.instance.id+'/'+rec.point.id));else if(rec.kind==='beam')locateBeam(rec.beam,beamResult.landings.points.find(p=>p.id===rec.instance.id+'/'+rec.point.id));else showLandingPoint(floorResult.landings.points.find(p=>p.id===rec.instance.id+'/'+rec.point.id));return;}
  const hit=ray.intersectObjects(regionMeshes.filter(m=>m.visible&&m.parent.visible))[0];if(hit)select(hit.object.userData.row,false);
 });
 function frame(){requestAnimationFrame(frame);if(dirty){resize();renderer.render(scene,camera);dirty=false;}}frame();
 window.stage1Debug={data,state,scene,camera,renderer,groups,rows,get regionMeshes(){return regionMeshes;},get baselines(){return baselineUI;},get baselineGroup(){return baselineGroup;},select:id=>select(rows.find(r=>r.id===id),true),getPixel:()=>renderer.domElement.toDataURL()};
}
function regionBounds(regions){const pts=regions.flatMap(r=>r.polygon);if(!pts.length)return [0,0,37000,17000];return [Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];}
function focus(row){
 if(!camera)return;if(state.selectedOrdinaryGroup&&row.zone.kind==='beam'){const g=ordinaryInput.groups.find(g=>g.id===state.selectedOrdinaryGroup);if(g)row={...row,zone:{...row.zone,region:g.region,bottom:g.bottom}};}const b=regionBounds(row.zone.region),i=row.instance,p=row.plan,c=new THREE.Vector3((b[0]+b[2])/2-centerX,(row.zone.nativeVertices?row.zone.sourceXYZ[1]:(row.zone.bottom??p.level))-p.base+i.offset+(i.order-1)*state.gap,-(b[1]+b[3])/2-centerZ);
 camera.position.add(c.clone().sub(controls.target));controls.target.copy(c);camera.userData.half=Math.max(1300,Math.hypot(b[2]-b[0],b[3]-b[1])*.68);camera.zoom=1;controls.update();resize();dirty=true;
}
function select(row,shouldFocus){
 if(!row)return;state.selectedProposal=null;state.selectedOrdinaryGroup=null;state.selected=row;
 if(!scopeVisible(row.instance)){state.scope=row.instance.id;syncGroups();renderTable();}
 const z=row.zone,p=row.plan,i=row.instance;if(z.kind==='beam')state.selectedOrdinaryGroup=ordinaryInput.groups.find(g=>g.sourceFaces.includes(z.face))?.id||null;
 const pair=(label,value)=>`<div><span>${label}</span><b>${escape(value)}</b></div>`;
 $('selection').innerHTML=`<b>${escape(row.id)}</b><br><span class="badge ${z.kind==='unmatched'||z.kind==='drawing'?'warn':''}">${names[z.kind]}</span><p class="note">${i.wallType} / ${i.floorType}</p><div class="detail">${pair('三维底面',z.face||'尚未对应')}${pair('承托区域面积',z.area==null?'—':fmt(z.area,3)+' m²')}${pair(z.kind==='stair-edge'?'沿线最低标高':'源模型底面高',fmt(z.bottom)+' mm')}${pair(z.kind==='stair-edge'?'沿线最高标高':'源模型顶面高',fmt(z.top)+' mm')}${pair(z.kind==='stair-edge'?'计算矩形宽':'局部几何高/厚',fmt(z.kind==='stair-edge'?z.width:z.geometricDepth)+' mm')}${pair('圆弧边界',z.hasArc?'包含':'—')}</div><div class="formula">${escape(z.evidence||z.reason)}<br>二维句柄：${escape((z.sources||[{source:z.source,layer:z.layer}]).map(s=>s.source+' ['+s.layer+']').join('；'))||'尚未匹配'}</div>${z.labels?.length?'<p class="note" style="margin-top:10px">附近尺寸标注候选（尚未唯一确认）</p><div class="formula">'+z.labels.map(l=>escape(l.text)+'<br><small>'+escape(l.source)+'</small>').join('<br>')+'</div>':z.kind==='stair-edge'?'<p class="note">矩形宽150mm已确认；长度取原生阳线。</p>':'<p class="note">未对应到可唯一确认的尺寸标注。</p>'}${z.sourceXYZ?`<p class="note" style="margin-top:10px">区域定位点，非固顶中心<br>源坐标 X/Y/Z：${z.sourceXYZ.map(x=>fmt(x,1)).join(' / ')} mm<br>叠加实体竖向高：${fmt((z.sourceXYZ?.[1]??z.bottom)-p.base+i.offset,1)} mm</p>`:''}${z.notes?.length?'<p class="note" style="color:#ae6b41">'+z.notes.map(escape).join('<br>')+'</p>':''}<p class="note" style="margin-top:12px">${z.kind==='slab'?'楼面布置或免放结果见上方逐块计算；区域定位点不是固顶中心。':'GL挂梁支撑见挂梁计算区；普通梁及楼梯阳线另行计算。'}</p>`;
 if(z.classificationBasis)$('selection').insertAdjacentHTML('afterbegin',`<div class="formula" style="border-color:${z.kind==='stair-edge'?'#10b981':'#f28a32'};margin-bottom:12px"><b>${z.kind==='stair-edge'?'楼梯阳线 · 单独计算':z.kind==='excluded'?'楼梯排除 · 不计算':z.kind==='slab'?'同平面楼面 · 已归类':'按梁处理 · 用户确认规则'}</b><br>${escape(z.classificationBasis)}</div>`);
 if(z.kind==='stair-edge')$('selection').insertAdjacentHTML('beforeend',`<div class="formula"><b>150mm宽，向楼梯实体内侧</b><br>实际斜长：${fmt(z.actualLength,2)} mm<br>水平投影长：${fmt(z.planLength,2)} mm<br>实际斜面面积：${fmt(z.area,4)} m²<br>斜面两端高差是坡升，不作为梁高或板厚。</div>`);
 if(z.classGroup)$('selection').insertAdjacentHTML('beforeend',`<p class="note">同类组：${escape(z.classGroup)} · ≤20mm含临界值；实际标高保留。</p>`);
 if(z.referenceRegions?.length)$('selection').insertAdjacentHTML('beforeend',`<p class="note">归类参考：${z.referenceRegions.map(r=>escape(r.id)+'（高差'+fmt(r.deltaHeight)+'mm）').join('、')}</p>`);
 $('selection').closest('aside').scrollTop=0;
 drawEvidence(row);highlight();updateBaselineThree();floorUI?.selectByRegion(row.plan.key,row.zone.id);beamUI?.selectByRegion(row.plan.key,row.zone.id);if(z.kind==='beam')ordinaryUI?.selectByRegion(row.plan.key,row.zone.id);if(!['slab','gl','beam'].includes(z.kind))reviewUI.showInspector('none');rackUI?.inspectRegion(row.plan.key,row.zone.id,row.instance.id);if(shouldFocus)focus(row);
}
function drawEvidence(row){
 const p=row?.plan||plans[data.instances.find(i=>state.scope==='all'||i.id===state.scope).key],z=row?.zone;
 const full=p.drawingEvidence.flatMap(r=>r.region),bb=regionBounds(z?.region||full),pad=z?Math.max(400,Math.max(bb[2]-bb[0],bb[3]-bb[1])*.14):700;
 const view=[bb[0]-pad,-bb[3]-pad,bb[2]-bb[0]+2*pad,bb[3]-bb[1]+2*pad];
 const path=rs=>(rs||[]).map(r=>[r.polygon,...r.holes].filter(a=>a.length).map(a=>'M'+a.map(([x,y])=>x+','+(-y)).join('L')+'Z').join('')).join('');
 let svg=p.drawingEvidence.map(r=>`<path d="${path(r.region)}" fill="none" stroke="#9cab9c" stroke-width="${z?4:50}"/>`).join('');
 if(z)svg+=`<path d="${path(z.region)}" fill="#dc9a4350" fill-rule="evenodd" stroke="#c58530" stroke-width="${Math.max(4,view[2]/300)}"/>`;
 const labels=z?.labels||[];for(const l of labels)svg+=`<text x="${l.at[0]}" y="${-l.at[1]}" font-size="${Math.min(150,view[2]/28)}" fill="#496452">${escape(l.text)}</text>`;
 $('drawing').setAttribute('viewBox',view.join(' '));$('drawing').innerHTML=svg;
 $('drawingTitle').textContent=p.wallType+' / '+p.floorType;
 $('drawingNote').innerHTML=`本次文件：${escape(data.drawingFile)}<br>原坐标配准：${data.cadRegistration.count} 处不同轮廓重合<br>${z?'选区 '+escape(z.id)+' 的 STEP 边界与附近二维轮廓':'灰线是本次DWG提取的梁、板边及GL范围'}<br>源DWG句柄保留，可回到原图逐项核查。`;
}
function filteredRows(){
 const needle=state.search.toLowerCase();return rows.filter(r=>scopeVisible(r.instance)&&(state.kind==='all'?['slab','beam','gl','stair-edge'].includes(r.zone.kind):matchesKind(r.zone.kind,r.zone))&&(!needle||JSON.stringify({id:r.id,face:r.zone.face,labels:r.zone.labels,sources:r.zone.sources,source:r.zone.source}).toLowerCase().includes(needle)));
}
function renderTable(){
 const all=filteredRows(),pages=Math.max(1,Math.ceil(all.length/20));state.page=Math.min(state.page,pages-1);
 $('tableHead').innerHTML='<tr><th>层 / 模型</th><th>区域</th><th>类型</th><th>实体尺寸 / 阳线条带</th><th>面积 m²</th><th>原生实体面</th><th>二维依据句柄</th></tr>';
 $('tableBody').innerHTML=all.slice(state.page*20,state.page*20+20).map(r=>`<tr data-row="${r.id}" tabindex="0"><td>${r.instance.label} · ${r.plan.wallType}<br><small>${r.plan.floorType}</small></td><td>${r.zone.id}</td><td>${names[r.zone.kind]}</td><td>${r.zone.kind==='stair-edge'?'150mm宽 · 斜长'+fmt(r.zone.actualLength)+'mm':r.zone.geometricDepth==null?'待确认':fmt(r.zone.geometricDepth)+' mm'}</td><td>${fmt(r.zone.area,3)}</td><td>${r.zone.face||'待对应'}</td><td>${escape((r.zone.sources||[{source:r.zone.source}]).map(s=>s.source).join(' / '))||'待匹配'}</td></tr>`).join('')||'<tr><td colspan="7">当前筛选无区域。</td></tr>';
 $('tableCount').textContent=`${all.length} 个识别分区（非固顶数量）`;$('pageCount').textContent=`${state.page+1} / ${pages}`;$('prev').disabled=state.page===0;$('next').disabled=state.page>=pages-1;
 for(const tr of $('tableBody').querySelectorAll('[data-row]')){const go=()=>{select(rows.find(r=>r.id===tr.dataset.row),true);$('viewer').scrollIntoView({behavior:'smooth',block:'start'});};tr.addEventListener('click',go);tr.addEventListener('keydown',e=>{if(e.key==='Enter')go();});}
}
for(const button of document.querySelectorAll('[data-scope]'))button.onclick=()=>{state.scope=button.dataset.scope;state.page=0;syncGroups();highlight();fit();renderTable();drawEvidence();};
for(const card of document.querySelectorAll('[data-layer]')){card.tabIndex=0;card.setAttribute('role','button');const go=()=>document.querySelector(`[data-scope="${card.dataset.layer}"]`).click();card.onclick=go;card.onkeydown=e=>{if(e.key==='Enter')go();};}
for(const button of document.querySelectorAll('[data-camera]'))button.onclick=()=>{state.camera=button.dataset.camera;fit();};
$('fit').onclick=fit;
$('gap').oninput=e=>{state.gap=+e.target.value;$('gapValue').textContent=fmt(state.gap)+' mm';syncGroups();highlight();fit();};
$('opacity').oninput=e=>{state.opacity=+e.target.value/100;$('opacityValue').textContent=e.target.value+'%';for(const mat of nativeMaterials)mat.opacity=state.opacity;dirty=true;};
$('projection').onchange=e=>{state.projection=e.target.value;drawRegions();syncGroups();};
for(const id of ['showAreas','through','showPending','showYangline'])$(id).onchange=filterMeshes;
for(const [id,delta] of [['panUp',700],['panDown',-700]])$(id).onclick=()=>{if(!camera)return;camera.position.y+=delta;controls.target.y+=delta;controls.update();dirty=true;};
function full(value){$('viewer').classList.toggle('expanded',value);document.body.style.overflow=value?'hidden':'';requestAnimationFrame(()=>{resize();dirty=true;});}
$('full').onclick=()=>full(!$('viewer').classList.contains('expanded'));$('exitFull').onclick=()=>full(false);document.addEventListener('keydown',e=>{if(e.key==='Escape')full(false);});
$('kind').onchange=e=>{state.kind=e.target.value;state.page=0;filterMeshes();renderTable();};
$('edgeBeams').onclick=()=>{state.kind='edge-beam';$('kind').value=state.kind;state.scope='L1';state.projection='all';$('projection').value='all';state.search='';$('search').value='';state.page=0;drawRegions();syncGroups();renderTable();state.camera='bottom';fit();select(rows.find(r=>r.instance.id==='L1'&&r.zone.id==='even-R117'),true);$('viewer').scrollIntoView({behavior:'smooth',block:'start'});};
$('stairYangline').onclick=()=>{state.kind='stair-edge';$('kind').value=state.kind;state.scope='L1';state.projection='all';$('projection').value='all';$('showYangline').checked=true;$('showAreas').checked=true;state.search='';$('search').value='';state.page=0;drawRegions();syncGroups();renderTable();state.camera='bottom';fit();select(rows.find(r=>r.instance.id==='L1'&&r.zone.kind==='stair-edge'),true);$('viewer').scrollIntoView({behavior:'smooth',block:'start'});};
$('search').oninput=e=>{state.search=e.target.value;state.page=0;renderTable();};
$('prev').onclick=()=>{state.page--;renderTable();};$('next').onclick=()=>{state.page++;renderTable();};
$('exportCsv').onclick=()=>{const all=rows.map(r=>[r.instance.label,r.plan.wallType,r.plan.floorType,r.zone.id,names[r.zone.kind],r.zone.face||'',r.zone.bottom??'',r.zone.top??'',r.zone.geometricDepth??'',r.zone.area??'',(r.zone.sources||[{source:r.zone.source}]).map(s=>s.source).join(';'),(r.zone.labels||[]).map(l=>l.text).join(';'),r.zone.evidence||r.zone.reason,r.zone.participatesInCalculation===false||['unmatched','drawing','excluded'].includes(r.zone.kind)?'否':'是',r.zone.calculationCategory||r.zone.kind,r.zone.width??'',r.zone.actualLength??'',r.zone.planLength??'']);const csv=[['层实例','墙柱类型','楼面类型','识别区域','类型','原生面','源底面高mm','源顶面高mm','局部几何高厚mm','区域面积m2','二维句柄','附近标注候选未确认','依据','是否参与计算','计算类别','矩形宽mm','实际斜长mm','水平投影长mm'],...all].map(a=>a.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\r\n');save('杭州5号楼_4层识别清单.csv','\uFEFF'+csv,'text/csv;charset=utf-8');};
$('exportJson').onclick=()=>{const result={...data,workflowStage:'floor-and-gl-supports',baselines:baselineUI.getSettings(),floorCalculation:floorUI.getResult()||{status:'pending'},beamCalculation:beamUI.getResult()||{status:'pending'},ordinaryBeamCalculation:ordinaryUI.getResult()||{status:'pending'},rackCalculation:rackUI?.view().result||{status:'pending'},plans:data.plans.map(({meshes,...p})=>p)};save('杭州5号楼_识别依据与楼面支撑.json',JSON.stringify(result,null,2),'application/json');};
$('offline').onclick=()=>{const page=new DOMParser().parseFromString(originalHTML,'text/html');page.getElementById('baseline-settings').textContent=JSON.stringify(baselineUI.getSettings()).replace(/</g,'\\u003c');save('杭州5号楼_4层基本模型.html','<!DOCTYPE html>\n'+page.documentElement.outerHTML,'text/html;charset=utf-8');};
baselineUI=createBaselineController({data,onChange:()=>{reviewUI.clearPoint();updateBaselineThree();floorUI?.onBaselineChange();beamUI?.onBaselineChange();ordinaryUI?.onBaselineChange();},getSelectedRow:()=>state.selected,onPickThree:()=>{const editor=baselineUI.getEditor();state.scope=data.instances.find(i=>i.key===editor.planKey)?.id||data.instances[0].id;state.kind='all';$('kind').value='all';state.projection='all';$('projection').value='all';$('showAreas').checked=true;state.camera='top';drawRegions();syncGroups();renderTable();fit();$('viewer').scrollIntoView({behavior:'smooth',block:'start'});},onLocate:base=>{if(!camera)return;if(base.floorId){state.scope=data.instances.find(i=>base.floorId.startsWith(i.key+'/'))?.id||data.instances[0].id;syncGroups();}state.camera='top';fit();const instance=data.instances.find(i=>state.scope==='all'||i.id===state.scope),p=plans[instance.key],c=new THREE.Vector3(base.origin[0]-centerX,p.level-p.base+instance.offset+(instance.order-1)*state.gap,-base.origin[1]-centerZ);camera.position.add(c.clone().sub(controls.target));controls.target.copy(c);camera.userData.half=4500;camera.zoom=1;controls.update();resize();dirty=true;$('viewer').scrollIntoView({behavior:'smooth',block:'start'});}});
floorUI=createFloorController({data,input:floorInput,onInspect:()=>reviewUI.showInspector('floor'),baselines:baselineUI,onSelectLanding:showLandingPoint,onCalculationSelect:f=>{if(f){const i=data.instances.find(i=>i.key===f.key&&scopeVisible(i));if(i)rackUI?.inspectOwner('floor',f.id,i.id);}},onResults:value=>{if(!value&&state.selectedLength){state.selectedLength=null;$('selection').innerHTML='<p>基准正在修改或重新计算，旧点位长度已停用。</p>';}floorResult=value;updateFloorThree();rackUI?.onSourcesChanged();},onSelect:(floor,result)=>{if(!camera)return;const instance=data.instances.find(i=>i.key===floor.key&&scopeVisible(i))||data.instances.find(i=>i.key===floor.key);state.scope=instance.id;syncGroups();const zone=plans[floor.key].zones.find(z=>z.id===floor.memberIds[0]);if(zone)select(rows.find(r=>r.instance.id===instance.id&&r.zone===zone),false);focus({instance,plan:plans[floor.key],zone:{region:floor.region,bottom:zone?.bottom??3000}});$('viewer').scrollIntoView({behavior:'smooth',block:'start'});}});
beamUI=createBeamController({data,input:beamInput,onInspect:()=>reviewUI.showInspector('beam'),baselines:baselineUI,onResults:value=>{beamResult=value;if(!value)state.selectedBeamLength=null;updateBeamThree();rackUI?.onSourcesChanged();},onLocate:locateBeam});
for(const id of ['showFloorResults','showBeamResults'])$(id).onchange=()=>{updateFloorThree();updateBeamThree();};
ordinaryUI=createOrdinaryController({data,input:ordinaryInput,baselines:baselineUI,onInspect:()=>reviewUI.showInspector('ordinary'),onResults:value=>{ordinaryResult=value;if(!value)state.selectedOrdinaryLength=null;updateOrdinaryThree();rackUI?.onSourcesChanged();},onLocate:locateOrdinary});
rackUI=createRackController({getSources:rackSources,data,floorInput,landingInput,getSettings:()=>baselineUI.getSettings(),onChange:updateRackThree,onInspect:()=>reviewUI.showInspector('rack'),onLocate:locateRack,onIsolate:isolateRack,onReady:()=>{if(state.selected){if(rackUI.view().uniform)rackUI.inspectRegion(state.selected.plan.key,state.selected.zone.id,state.selected.instance.id);else select(state.selected,false);}}});rackUI.onSourcesChanged();
reviewUI.showInspector('ordinary');
renderTable();drawEvidence();
try{setup();}catch(e){console.error(e);$('error').hidden=false;$('error').textContent='三维视图未能启动：'+e.message+'。下方二维依据和识别清单仍可查看。';}

createWorkbenchLayout(data.title);requestAnimationFrame(()=>{resize();fit();dirty=true;});
