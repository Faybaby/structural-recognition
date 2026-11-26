import {calculateBeams} from './beam-core.js';
import {calculateLandings} from './landing-core.js';
import landingInput from './projects/hangzhou/landing-input.json';
export function createBeamController({data,input,baselines,onResults,onLocate,onInspect}){
 const $=id=>document.getElementById(id),fmt=(n,d=1)=>n==null?'—':Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d}),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let result=null,selected=input.beams[0]?.id,timer=null,fresh=false;
 function getResult(){return fresh&&result?{...result,beams:result.beams.map(({gdModel,...b})=>({...b,nodes:b.nodes.map(({model,...n})=>n)})),rules:{...Object.fromEntries(Object.entries(result.rules).filter(([k])=>k!=='gdLength')),componentSelection:'deferred'},positionsOnly:true,componentSelection:'deferred',project:data.projectName,baselines:baselines.getSettings(),instances:data.instances,scope:input.rules.scope}:null;}
 function buttons(){const ready=!!baselines.getSettings().global&&!baselines.isDirty();$('beamRecalculate').disabled=!ready;$('beamExportJson').disabled=!fresh;$('beamExportCsv').disabled=!fresh;$('beamLocate').disabled=!fresh;}
 function plot(b){
  if(!b){$('beamPlot').innerHTML='';return;}
  const len=b.length,pad=Math.max(300,len*.12),font=Math.max(35,(len+2*pad)/40),w=b.gw,u=font*1.6;
  const text=(x,y,s,color='#466a54',anchor='middle')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${font}" fill="${color}" stroke="white" stroke-width="${font*.12}" paint-order="stroke">${esc(s)}</text>`;
  const dim=(a,z,y,s,color='#466a54')=>`<path class="dimension-line" d="M${a},${y}H${z}M${a},${y-12}v24M${z},${y-12}v24" stroke="${color}" stroke-width="3"/>`+text((a+z)/2,y-20,s,color);
  let svg=`<rect x="0" y="${-w/2}" width="${len}" height="${w}" fill="#f0e8fa" stroke="#9461c4" stroke-width="4"/><path class="beam-reference" d="M${-pad*.25},0H${len+pad*.25}" stroke="#a34db4" stroke-width="3" stroke-dasharray="20 12"/>`;
  svg+=dim(0,len,-w/2-u*2.7,'GL实体长 '+fmt(len)+' mm');
  svg+=text(0,w/2+u,b.ends[0].type==='yang'?'首端：阳线':'首端：阴线','#6b5480','start')+text(len,w/2+u,b.ends[1].type==='yang'?'末端：阳线':'末端：阴线','#6b5480','end');
  svg+=text(len/2,-w/2-u*1.5,'GW1='+fmt(w)+'；中心线 GW1/2='+fmt(w/2),'#6b5480');
  for(const n of b.nodes||[])svg+=`<g class="${n.origin==='阳线端部'?'beam-end-point':'beam-interior-point'}"><path d="M${n.t},${-w/2-15}V${w/2+15}" stroke="#d44868" stroke-width="3"/><circle cx="${n.t}" cy="0" r="${font*.25}" fill="${n.origin==='阳线端部'?'#d44868':'#a85d20'}" stroke="white" stroke-width="3"/>`+text(n.t,-w/2-u*.35,n.id.split('-').at(-1),'#a33652')+'</g>';
  if(b.gtt!=null){svg+=dim(b.anchors[0],b.anchors[1],w/2+u*4.1,'GTT='+fmt(b.gtt),'#315780');if(b.endOffsets[0]!=null)svg+=text(0,w/2+u*2.4,'首端 GLL1='+fmt(b.endOffsets[0]),'#a33652','start');if(b.endOffsets[1]!=null)svg+=text(len,w/2+u*2.4,'末端 GLL1='+fmt(b.endOffsets[1]),'#a33652','end');}
  if(b.h){const interior=b.nodes.filter(n=>n.origin!=='阳线端部');if(interior.length){svg+=dim(b.anchors[0],interior[0].t,-w/2-u*4.1,'H1 '+fmt(b.h[0]));svg+=dim(interior.at(-1).t,b.anchors[1],-w/2-u*4.1,'H2 '+fmt(b.h[1]));for(let i=1;i<interior.length;i++)svg+=dim(interior[i-1].t,interior[i].t,-w/2-u*4.1,'XX='+fmt(b.index.spacing));}}
  $('beamPlot').setAttribute('viewBox',[-pad,-w/2-u*5.5,len+2*pad,w+u*11].join(' '));$('beamPlot').innerHTML=svg;
 }
 function details(){
  const original=input.beams.find(b=>b.id===selected),r=fresh?result?.beams.find(b=>b.id===selected):null,b=r||original;if(!b)return;
  $('beamSelectedName').textContent=(b.key==='even'?'偶模型':'奇模型')+' · '+b.id.split('/').at(-1);plot(b);
  if(!r){$('beamSteps').innerHTML='<p class="note">保存整楼基准后，梁计算独立运行。楼面显示开关不改变梁的点位。</p>';$('beamPointBody').innerHTML='';return;}
  const step=(n,title,body)=>`<li><b>${n}. ${title}</b><div>${body}</div></li>`;
  let html=step(1,'GL尺寸与实体梁宽',`${esc(b.name)}<br>GL底面宽GW1=${fmt(b.gw)}mm，实体梁宽=${fmt(b.width)}mm；GL标注高=${fmt(b.height)}mm，优先用作查表梁高。<br>本阶段只计算中心位置，固顶型号后续计算。<br>${b.slabThickness?.defaulted?"板厚未识别，按150mm计算":"相邻已确认板厚取较大值 "+fmt(b.thickness)+"mm"}；层高${input.storyHeight}mm。`);
  html+=step('1a','自动匹配既有情况',`<strong>${esc(b.matchedRule?.label||'核验阴阳端后匹配')}</strong>；按真实阴阳端选取原有规则，再查表、算GTT与承接长度。`);
  const slabStep=b.slabThickness?.defaulted?'<strong>板厚未识别 → 按150mm计算。</strong><br>150mm为用户指定的查表板厚，不改动真实几何。<br>':'';
  html+=step(2,'尺寸向上查原表',slabStep+(b.index?`原尺寸 ${fmt(b.width)}×${fmt(b.height)} → 查表 ${b.index.width}×${b.index.height}mm；板厚列${b.index.thickness}mm。<br>《${esc(input.source.file)}》“${input.source.sheet}”!${b.index.cell}：<strong>XX=${b.index.spacing}mm</strong>。查表放大不改变实体尺寸。`:'向上取档后仍缺项，未生成正式点位。'));
  html+=step(3,'判定三种端部情况',b.ends.map((e,i)=>`${i?'末':'首'}端：${e.type==='yang'?'阳线（凸出端）':'阴线（接墙/梁内角端）'}；${esc(e.evidence)}。`).join('<br>')+`<br>情况${b.caseNumber??'待定'}；实体中心线保持GW1/2，不横向偏移。`);
  if(b.status==='passed'){
   html+=step(4,'先放阳线端部固顶',`${b.gw<=150?'80≤GW1≤150：100≤GLL1≤130':'GW1＞150：50≤GLL1≤80'}mm（GW1=150按前档）。<br>${b.endOffsets.map((v,i)=>`${i?'末':'首'}端：${v==null?'阴线，不加端部点':'GLL1='+fmt(v)+'mm'}`).join('；')}。<br>沿梁轴向距整楼基准的投影坐标为50mm倍数；横向保持实体中心线。`);
   html+=step(5,'按GTT补中间点',`GTT=${fmt(b.gtt)}mm，XX=${b.index.spacing}mm。<br><strong>${esc(b.mode)}</strong>。<br>阳线端部${b.nodes.filter(n=>n.origin==='阳线端部').length}点，中间补${b.nodes.filter(n=>n.origin!=='阳线端部').length}点，共${b.nodes.length}点。${b.h?`<br>H1=${fmt(b.h[0])}、H2=${fmt(b.h[1])}mm，尽量均分。`:''}${b.longRule?`<br>长梁严格检查500≤H1/H2＜${b.index.spacing-100}mm，内部相邻点距固定XX。`:''}${!b.nodes.length?'<br>双阴线且GTT＜XX，按本次规则不新增点，已计算的零点结果。':''}`);
   html+=step(6,'真实底面与上下同位',`所有点位在原生GL底面内；相同实体两模型点位${b.alignmentChecked?'已核对同位':'待核对'}。<br>梁计算不读取楼面支撑点位、相位或显示状态。当前模型承接长度单独向下求最近实际顶面。`);
  }else html+=step(4,'待处理原因',`<strong>${esc(b.reasons.join('；'))}</strong>。未将待处理判为免放，也没有放宽尺寸或端距。`);
  $('beamSteps').innerHTML='<ol>'+html+'</ol>';
  const lengths=result.landings.points.filter(p=>p.floorId===b.id);
  $('beamPointBody').innerHTML=lengths.map(p=>{const n=b.nodes.find(n=>n.id===p.nodeId);return `<tr><td><button data-beam-point="${esc(p.id)}">${p.layer} / ${esc(p.nodeId.split('-').at(-1))}</button></td><td>${esc(n.origin)}</td><td>${n.world.map(v=>fmt(v,3)).join(' / ')}</td><td>${fmt(n.axisCoordinate,3)}</td><td>${p.status==='found'?fmt(p.length)+' mm':p.status==='review'?'承接类别待核对':'未找到承接面'}</td></tr>`;}).join('')||'<tr><td colspan="5">'+(b.status==='passed'?'本段按规则没有新增支撑点。':'待处理，暂无正式点位。')+'</td></tr>';
  for(const button of $('beamPointBody').querySelectorAll('[data-beam-point]'))button.onclick=()=>onLocate(b,result.landings.points.find(p=>p.id===button.dataset.beamPoint));
 }
 function table(){
  $('beamTableBody').innerHTML=fresh?result.beams.map(b=>`<tr data-beam-id="${esc(b.id)}" tabindex="0"><td>${esc(b.id)}</td><td>${esc(b.name)}</td><td>${fmt(b.width)}×${fmt(b.height)}</td><td>${b.index?b.index.width+'×'+b.index.height+' / '+b.index.spacing:'缺项'}</td><td>${b.caseNumber?'情况'+b.caseNumber:'待定'}</td><td>${b.status==='passed'?b.nodes.length:'待处理'}</td><td>${b.status==='passed'?esc(b.mode):esc(b.reasons.join('；'))}</td></tr>`).join(''):'<tr><td colspan="7">请先保存整楼基准。梁与楼面分别计算。</td></tr>';
  for(const tr of $('beamTableBody').querySelectorAll('[data-beam-id]')){const go=()=>{selected=tr.dataset.beamId;onInspect?.();details();onLocate(result.beams.find(b=>b.id===selected));};tr.onclick=go;tr.onkeydown=e=>{if(e.key==='Enter')go();};}
 }
 function run(){
  if(timer)clearTimeout(timer);if(!baselines.getSettings().global||baselines.isDirty()){fresh=false;result=null;buttons();table();details();onResults(null);$('beamCalcStatus').textContent='先保存整楼基准；基准修改期间旧梁点位停用。';$('beamSummary').textContent='梁结果已停用，保存基准后重新计算。';$('beamLandingSummary').textContent='梁支撑至承接面长度待重新计算。';return;}
  fresh=false;buttons();$('beamCalcStatus').textContent='正在独立查表与计算挂梁…';onResults(null);
  timer=setTimeout(()=>{try{const next=calculateBeams(input,baselines.getSettings());next.landings=calculateLandings({floors:next.beams},data,landingInput);result=next;fresh=true;const points=data.instances.reduce((s,i)=>s+next.beams.filter(b=>b.key===i.key).reduce((n,b)=>n+b.nodes.length,0),0);$('beamSummary').textContent=`两模型 ${next.summary.beams} 段挂梁：${next.summary.passed} 段已计算，${next.summary.pending} 段待处理；其中 ${next.summary.zero} 段按规则无需新增。当前模型共 ${points} 点（阳线端部与中间补点分别统计）。`;$('beamCalcStatus').textContent=`梁计算完成 · 基准版本${next.baselineRevision} · 独立于楼面结果`;$('beamLandingSummary').textContent=`梁支撑至实际承接面：${next.landings.summary.found}点已找到；${next.landings.summary.crossLayer}点跨层；${next.landings.summary.missing}点在当前模型范围内无承接面${next.landings.summary.review?'；'+next.landings.summary.review+'点类别待核对':''}。未找到的长度保持待确认。`;buttons();table();details();onResults(getResult());}catch(e){fresh=false;$('beamCalcStatus').textContent='梁计算未完成：'+e.message;buttons();onResults(null);}},20);
 }
 const save=(name,body,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);};
 $('beamRecalculate').onclick=run;$('beamLocate').onclick=()=>{const b=getResult()?.beams.find(b=>b.id===selected);if(b)onLocate(b);};
 $('beamExportJson').onclick=()=>{const r=getResult();if(r)save('杭州5号楼_挂梁支撑计算.json',JSON.stringify(r,null,2),'application/json');};
 $('beamExportCsv').onclick=()=>{const r=getResult();if(!r)return;const rows=[['层实例','挂梁','点号','点位类型','Xmm','Ymm','源底面标高mm','当前模型承托标高mm','实体梁宽','GL高','查表梁宽','查表梁高','板厚','XX','索引单元格','GTT','GLL1','H1','H2','基准轴向坐标mm','承接长度mm','承接状态']];for(const i of data.instances)for(const b of r.beams.filter(b=>b.key===i.key&&b.status==='passed'))for(const n of b.nodes){const l=r.landings.points.find(l=>l.id===i.id+'/'+n.id);rows.push([i.id,b.id,n.id,n.origin,...n.world,n.sourceHeight,n.sourceHeight-b.nativeBase+i.offset,b.width,b.height,b.index.width,b.index.height,b.index.thickness,b.index.spacing,input.source.sheet+'!'+b.index.cell,b.gtt,n.gll??'',b.h?.[0]??'',b.h?.[1]??'',n.axisCoordinate,l.status==='found'?l.length:'',l.status]);}save('杭州5号楼_挂梁支撑点位.csv','\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');};
 for(const id of ['showBeamSupports','showBeamGrid','showBeamLengths'])$(id).onchange=()=>onResults(getResult());
 table();details();run();return {onBaselineChange:run,getResult,selectByRegion(key,id){const b=input.beams.find(b=>b.key===key&&b.memberIds.includes(id));if(b){selected=b.id;onInspect?.();details();}},selectBeam(id){selected=id;onInspect?.();details();}};
}
