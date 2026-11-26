import {SCHEMA,geometryKey,validateSettings,validatePoint,effectiveBaseline,toBaseline,fromBaseline} from './baseline-core.js';

export function createBaselineController({data,onChange,onPickThree,onLocate,getSelectedRow}){
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clone=x=>JSON.parse(JSON.stringify(x)),fmt=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:3});
 const key=geometryKey(data),storageKey='boyue-support-baselines-v1:'+key;
 const floors=data.plans.flatMap(plan=>plan.zones.filter(z=>z.kind==='slab').map(zone=>({id:plan.key+'/'+zone.id,plan,zone})));
 const validFloors=new Set(floors.map(f=>f.id));
 let config={schema:SCHEMA,geometryKey:key,revision:0,updatedAt:null,global:null,locals:{}},warning='',persistent=true,history=[],scope='global',floorId=floors[0]?.id,planKey=data.plans[0].key,draft={origin:[0,0],angleDeg:0},dirty=false,pickMode=null,dragging=false,view=null;
 try{const embedded=JSON.parse($('baseline-settings').textContent||'null'),stored=localStorage.getItem(storageKey);if(embedded)config=validateSettings(embedded,key,validFloors);else if(stored)config=validateSettings(JSON.parse(stored),key,validFloors);}catch(e){warning='未载入旧基准：'+e.message;}
 $('bpPlan').innerHTML=data.plans.map(p=>`<option value="${p.key}">${p.wallType} / ${p.floorType}</option>`).join('');
 $('bpFloor').innerHTML=floors.map(f=>`<option value="${f.id}">${f.plan.wallType} · ${f.zone.id} · ${fmt(f.zone.geometricDepth)}mm</option>`).join('');
 const activeFloor=()=>floors.find(f=>f.id===floorId);
 const saved=()=>scope==='global'?config.global:effectiveBaseline(config,floorId);
 function message(text,bad=false){$('bpMessage').textContent=text;$('bpMessage').classList.toggle('bad',bad);}
 function setFields(){ $('bpX').value=draft.origin[0];$('bpY').value=draft.origin[1];$('bpAngle').value=draft.angleDeg; }
 function loadDraft(){draft=clone(saved()||{origin:[0,0],angleDeg:0});dirty=false;pickMode=null;setFields();render();}
 function readFields(){
  const values=[$('bpX').value,$('bpY').value,$('bpAngle').value];if(values.some(x=>!x.trim()))throw Error('请填写X、Y和方向角。');return validatePoint({origin:values.slice(0,2).map(Number),angleDeg:Number(values[2])});
 }
 function edited(){try{draft=readFields();dirty=true;message('基准已修改，点击“保存基准点”后生效。');render();}catch(e){dirty=true;message(e.message,true);renderStatus();}}
 function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify(config));persistent=true;}catch(e){persistent=false;}
 }
 function commit(next,text){history.push(clone(config));if(history.length>15)history.shift();config=next;config.revision++;config.updatedAt=new Date().toISOString();persist();loadDraft();message(text+(persistent?' 已保存在本浏览器。':' 浏览器未允许长期保存，请立即导出备份。'),!persistent);onChange();}
 function renderStatus(){
  const inherited=scope==='floor'&&!config.locals[floorId],base=saved();
  $('bpStatus').textContent=dirty?'有未保存修改':base?(inherited?'继承整楼基准':'基准已保存'):'尚未设置基准';
  $('bpStatus').className='baseline-status '+(dirty?'draft':base?'ready':'');
  $('bpFloorRow').hidden=scope!=='floor';$('bpFloor').value=floorId;$('bpScope').value=scope;$('bpPlan').value=planKey;
  $('bpInheritance').textContent=scope==='global'?'未单独设置的楼面继承整楼基准。':config.locals[floorId]?'当前楼面使用独立基准；其他楼面继续使用各自或整楼基准。':'当前楼面继承整楼基准，可修改后保存为独立基准。';
  $('bpInherit').hidden=scope!=='floor';$('bpInherit').disabled=!config.locals[floorId];$('bpUndo').disabled=!history.length;
  $('bpPick2d').setAttribute('aria-pressed',pickMode==='2d');$('bpPick3d').setAttribute('aria-pressed',pickMode==='3d');
  $('bpPick2d').textContent=pickMode==='2d'?'正在平面选点 · 点击取消':'在平面点选';$('bpPick3d').textContent=pickMode==='3d'?'正在三维选点 · 点击取消':'在三维点选';
  $('bpSave').disabled=scope==='floor'&&!config.global;
  const localCount=Object.keys(config.locals).length;
  $('bpSummary').textContent=config.global?`整楼BP：X=${fmt(config.global.origin[0])}，Y=${fmt(config.global.origin[1])}，方向${fmt(config.global.angleDeg)}°；${localCount}块楼面已单独设置。`:'整楼基准尚未确认，请先设置并保存。';
  $('floorBaselineGate').textContent=!config.global?'先保存整楼基准，再进入楼面支撑计算。':dirty?'请先保存或放弃当前修改。':'基准已就绪。4200 mm 超出现有楼面间距表范围，相关步骤标为待核对。';
  $('floorBaselineGate').classList.toggle('ready',Boolean(config.global)&&!dirty);
  $('bpRevision').textContent=`基准版本 ${config.revision}${config.updatedAt?' · '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short'}).format(new Date(config.updatedAt)):''}`;
 }
 function bounds(regions){const pts=regions.flatMap(r=>r.polygon);return [Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];}
 function path(regions){return regions.map(r=>[r.polygon,...r.holes].map(a=>'M'+a.map(([x,y])=>`${x},${-y}`).join('L')+'Z').join('')).join('');}
 function plan(){return data.plans.find(p=>p.key===planKey);}
 function resetView(){const regions=scope==='floor'?activeFloor().zone.region:plan().zones.flatMap(z=>z.region);const b=bounds(regions),pad=Math.max(250,Math.max(b[2]-b[0],b[3]-b[1])*.05);view=[b[0]-pad,-b[3]-pad,b[2]-b[0]+2*pad,b[3]-b[1]+2*pad];}
 function marker(base,label,color,scale,opacity=1){const [x,y]=base.origin,a=base.angleDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),l=scale*9,r=scale*1.3;return `<g opacity="${opacity}"><path d="M${x-l*c},${-y+l*s}L${x+l*c},${-y-l*s}M${x+l*s},${-y+l*c}L${x-l*s},${-y-l*c}" stroke="${color}" stroke-width="${scale*.5}"/><circle data-bp-marker="true" cx="${x}" cy="${-y}" r="${r}" fill="white" stroke="${color}" stroke-width="${scale*.5}"/><text x="${x+scale*2}" y="${-y-scale*2}" fill="${color}" font-size="${scale*2.4}">${label}</text><text x="${x+l*c}" y="${-y-l*s}" fill="${color}" font-size="${scale*1.8}">X′</text><text x="${x-l*s}" y="${-y-l*c}" fill="${color}" font-size="${scale*1.8}">Y′</text></g>`;}
 function draw(){
  if(!view)resetView();const p=plan(),scale=view[2]/110;let svg='';
  for(const z of p.zones){const selected=scope==='floor'&&z.id===activeFloor().zone.id;svg+=`<path d="${path(z.region)}" fill="${z.kind==='slab'?(selected?'#c3e1f8':'#ebf2f6'):'#f6eadf'}" fill-rule="evenodd" stroke="${selected?'#4a98c7':'#c1ccc4'}" stroke-width="${scale*(selected?.32:.12)}"/>`;}
  for(const f of floors.filter(f=>f.plan.key===planKey&&config.locals[f.id]&&f.id!==floorId))svg+=marker(config.locals[f.id],'局部','#a07f9b',scale*.6,.65);
  if(config.global&&scope==='floor')svg+=marker(config.global,'整楼BP','#7f8d84',scale,.55);
  if(saved()&&dirty)svg+=marker(saved(),'已保存','#6a8c80',scale,.55);
  if(saved()||dirty)svg+=marker(draft,dirty?'BP草稿':'BP','#db3d8c',scale);
  $('bpPlanSvg').setAttribute('viewBox',view.join(' '));$('bpPlanSvg').innerHTML=svg;
  $('bpPlanSvg').classList.toggle('picking',pickMode==='2d');
  $('bpCoordinateReadout').textContent=(saved()||dirty)?`X ${fmt(draft.origin[0])} / Y ${fmt(draft.origin[1])} mm · ${fmt(draft.angleDeg)}°`:'点击“在平面点选”，或输入坐标设置基准点';
 }
 function render(){renderStatus();draw();onChange?.();}
 function snap(point,tolerance){
  if(!$('bpSnap').checked)return {point,snapped:false};let best=null,dist=tolerance;
  const zones=scope==='floor'?[activeFloor().zone]:plan().zones;
  for(const zone of zones)for(const r of zone.region)for(const ring of [r.polygon,...r.holes])for(let i=0;i<ring.length;i++){
   const q=ring[i],before=ring[(i+ring.length-1)%ring.length],after=ring[(i+1)%ring.length],u=[q[0]-before[0],q[1]-before[1]],v=[after[0]-q[0],after[1]-q[1]],lu=Math.hypot(...u),lv=Math.hypot(...v);
   if(lu<10||lv<10||(u[0]*v[0]+u[1]*v[1])/(lu*lv)>.9848)continue;
   const d=Math.hypot(q[0]-point[0],q[1]-point[1]);if(d<dist){dist=d;best=q;}
  }
  return {point:best?[...best]:point,snapped:Boolean(best)};
 }
 function setPoint(point,tolerance=0,stop=true){const hit=snap(point,tolerance);draft.origin=hit.point.map(n=>Math.round(n*1000)/1000);dirty=true;if(stop)pickMode=null;setFields();message(hit.snapped?'已吸附到轮廓角点，请保存。':'已选择基准点，请核对坐标后保存。');render();}
 function pointFromEvent(e){const matrix=$('bpPlanSvg').getScreenCTM();if(!matrix)return null;const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return [q.x,-q.y];}
 $('bpPlanSvg').addEventListener('pointerdown',e=>{if(e.button!==0)return;if(pickMode!=='2d'&&!e.target.hasAttribute('data-bp-marker'))return;e.preventDefault();dragging=true;$('bpPlanSvg').setPointerCapture(e.pointerId);const point=pointFromEvent(e);if(point)setPoint(point,view[2]/$('bpPlanSvg').clientWidth*12,false);});
 $('bpPlanSvg').addEventListener('pointermove',e=>{if(!dragging)return;const point=pointFromEvent(e);if(point)setPoint(point,view[2]/$('bpPlanSvg').clientWidth*12,false);});
 $('bpPlanSvg').addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;pickMode=null;if($('bpPlanSvg').hasPointerCapture(e.pointerId))$('bpPlanSvg').releasePointerCapture(e.pointerId);render();});
 $('bpPlanSvg').addEventListener('keydown',e=>{const steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};if(!steps[e.key]||!(saved()||dirty))return;e.preventDefault();const step=e.shiftKey?10:1;setPoint(draft.origin.map((v,i)=>v+steps[e.key][i]*step),0,false);});
 $('bpPlanSvg').addEventListener('wheel',e=>{e.preventDefault();const q=pointFromEvent(e);if(!q)return;const factor=e.deltaY>0?1.15:.87;if(view[2]*factor<200||view[2]*factor>200000)return;const cx=q[0],cy=-q[1];view=[cx+(view[0]-cx)*factor,cy+(view[1]-cy)*factor,view[2]*factor,view[3]*factor];draw();},{passive:false});
 for(const id of ['bpX','bpY','bpAngle'])$(id).addEventListener('input',edited);
 $('bpScope').onchange=e=>{scope=e.target.value;if(scope==='floor')planKey=activeFloor().plan.key;view=null;loadDraft();message(scope==='floor'&&!config.global?'请先保存整楼基准，才能设置独立楼面基准。':'可以直接修改坐标，或在平面、三维中选点。');};
 $('bpFloor').onchange=e=>{floorId=e.target.value;planKey=activeFloor().plan.key;view=null;loadDraft();};
 $('bpPlan').onchange=e=>{planKey=e.target.value;if(scope==='floor'){floorId=floors.find(f=>f.plan.key===planKey).id;loadDraft();}view=null;render();};
 $('bpUseSelected').onclick=()=>{const row=getSelectedRow();if(!row||row.zone.kind!=='slab'){message('请先在三维或识别清单中点选一块楼面。',true);return;}scope='floor';floorId=row.plan.key+'/'+row.zone.id;planKey=row.plan.key;view=null;loadDraft();$('baselineWorkflow').scrollIntoView({behavior:'smooth',block:'start'});};
 $('bpPick2d').onclick=()=>{pickMode=pickMode==='2d'?null:'2d';renderStatus();draw();message(pickMode?'在右侧平面选择位置；粉色基准点可拖动。':'已取消选点。');};
 $('bpPick3d').onclick=()=>{pickMode=pickMode==='3d'?null:'3d';renderStatus();if(pickMode){onPickThree();message('在三维视图点击蓝色楼面，选点后回到这里保存。');}else message('已取消三维选点。');};
 $('bpSave').onclick=()=>{try{const point=readFields();if(scope==='floor'&&!config.global)throw Error('请先保存整楼基准。');const next=clone(config);if(scope==='global')next.global=point;else next.locals[floorId]=point;commit(next,scope==='global'?'整楼基准已保存。':'此楼面独立基准已保存。');}catch(e){message(e.message,true);}};
 $('bpCancel').onclick=()=>{loadDraft();message('已恢复已保存的基准。');};
 $('bpInherit').onclick=()=>{const next=clone(config);delete next.locals[floorId];commit(next,'此楼面已恢复继承整楼基准。');};
 $('bpUndo').onclick=()=>{if(!history.length)return;const revision=config.revision;config=history.pop();config.revision=revision+1;config.updatedAt=new Date().toISOString();persist();loadDraft();message('已撤销上次保存。');};
 $('bpFit').onclick=()=>{view=null;draw();};
 $('bpFind').onclick=()=>{try{const base=readFields();if(!view)resetView();view[0]=base.origin[0]-view[2]/2;view[1]=-base.origin[1]-view[3]/2;draw();}catch(e){message(e.message,true);}};
 $('bpLocate').onclick=()=>{try{onLocate({...readFields(),floorId:scope==='floor'?floorId:null});}catch(e){message(e.message,true);}};
 $('bpExport').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:'application/json'}));a.download='杭州5号楼_基准点设置.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);};
 $('bpImportButton').onclick=()=>$('bpImport').click();
 $('bpImport').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2000000)throw Error('基准备份过大。');const imported=validateSettings(JSON.parse(await file.text()),key,validFloors);imported.revision=config.revision;commit(imported,'基准备份已导入。');}catch(error){message(error.message,true);}finally{e.target.value='';}};
 function markers(){
  const out=[];
  if(config.global)out.push({id:'global',...config.global,kind:'global',draft:false});
  for(const [id,point] of Object.entries(config.locals))out.push({id,...point,kind:'floor',floor:floors.find(f=>f.id===id),draft:false});
  if(dirty){const id=scope==='global'?'global':floorId;return out.filter(m=>m.id!==id).concat({id,...draft,kind:scope==='global'?'global':'floor',floor:scope==='floor'?activeFloor():null,draft:true});}
  return out;
 }
 loadDraft();if(warning)message(warning,true);else message('先保存整楼基准；需要时再为单块楼面设置独立基准。');
 return {getSettings:()=>clone(config),getEditor:()=>({scope,floorId,planKey}),markers,isPickingThree:()=>pickMode==='3d',pickThree({point,floorId:hitFloor,tolerance}){if(validFloors.has(hitFloor)){planKey=floors.find(f=>f.id===hitFloor).plan.key;if(scope==='floor')floorId=hitFloor;view=null;}setPoint(point,tolerance);$('baselineWorkflow').scrollIntoView({behavior:'smooth',block:'start'});},effective:floor=>effectiveBaseline(config,floor),isDirty:()=>dirty,toLocal:(point,floor)=>{const b=effectiveBaseline(config,floor);return b?toBaseline(point,b):null;},fromLocal:(point,floor)=>{const b=effectiveBaseline(config,floor);return b?fromBaseline(point,b):null;}};
}
