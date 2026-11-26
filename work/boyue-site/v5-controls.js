function renderOptimizationSummary(){const p=plan();$('optimizationSummary').innerHTML=`<b>${DATA.meta.manualModified?'人工修改后待重新校核':'居中 / 免加 / 避洞规则 '+p.summary.floorLayoutPass+' / '+p.summary.floorCount+' 块已计算'}</b>窄跨免加 ${p.summary.exemptFloors} 块；单个 ${p.summary.singleFloors} 块；两个 ${p.summary.twoFloors} 块。<br>挂梁实际矩形中心已放 ${p.summary.endSupportsPlaced} / ${p.summary.beamEnds} 处；固顶中心距洞边≥150mm。<br>梁下、挂梁和楼面分别计量；对应连接、索引缺项等见复核清单。`;}
function alignmentLabel(){return `重合区${DATA.meta.alignOverlap?'对齐':'不对齐'}_非重合区${DATA.meta.alignNonOverlap?'对齐':'不对齐'}`;}
function setAlignment(){
 const ao=$('overlapAlignment').value==='yes',an=$('alignmentMode').value==='aligned';
 const mode=ao?(an?'aligned':'independent'):(an?'nonoverlapOnly':'separate');
 if(!BUNDLE.variants[mode]){toast('该组合的计算结果尚未载入');return;}
 state.alignOverlap=ao;state.alignNonOverlap=an;state.alignmentMode=mode;DATA=BUNDLE.variants[mode];
 state.selected=null;state.page=0;state.search='';$('search').value='';/* Historical local edits require joint recalculation; do not replay into verified views. */toast('已切换：'+alignmentLabel());
}
function hangingCenter(rect){const a=rect.angle*Math.PI/180,u=[Math.cos(a),Math.sin(a)],v=[-Math.sin(a),Math.cos(a)];return [rect.origin[0]+u[0]*rect.length/2+v[0]*rect.width/2,rect.origin[1]+u[1]*rect.length/2+v[1]*rect.width/2];}
function rectVertices(r){const a=r.angle*Math.PI/180,u=[Math.cos(a)*r.length,Math.sin(a)*r.length],v=[-Math.sin(a)*r.width,Math.cos(a)*r.width],o=r.origin;return [o,[o[0]+u[0],o[1]+u[1]],[o[0]+u[0]+v[0],o[1]+u[1]+v[1]],[o[0]+v[0],o[1]+v[1]]];}
function hangingOverlay(){const r=state.hangingRect;if(!r||r.planKey!==state.plan)return '';const q=r.center;return `<g fill="none" stroke="#069aab" stroke-width="1.8" vector-effect="non-scaling-stroke"><path d="${path(rectVertices(r))}" vector-effect="non-scaling-stroke"/><path d="M${q[0]-110},${-q[1]}h220M${q[0]},${-q[1]-110}v220" vector-effect="non-scaling-stroke"/></g><text x="${q[0]+140}" y="${-q[1]-140}" font-size="95" fill="#087a85">几何中心 ${fmt(q[0],3)}, ${fmt(q[1],3)}</text>`;}
function openHangingTool(){
 baselineMode(false);$('hangingPanel').hidden=false;state.overlay=false;setStep(5);state.table='endSupports';
 const b=plan().beams.find(b=>!b.curved&&b.width===200&&b.depth===500)||plan().beams.find(b=>!b.curved);
 if(b){const a=Math.atan2(b.b[1]-b.a[1],b.b[0]-b.a[0]);$('hangX').value=b.a[0]+Math.sin(a)*b.width/2;$('hangY').value=b.a[1]-Math.cos(a)*b.width/2;$('hangW').value=b.width;$('hangL').value='';$('hangAngle').value=a*180/Math.PI;focusObject(b);}
 $('hangingStatus').textContent='请指定蓝框小矩形的实际长、宽；当前未猜测挂梁长度。可点取对角点后用精确CAD坐标修正。';$('lockHanging').disabled=true;render();
}
function calculateHanging(){
 const rect={origin:[+$('hangX').value,+$('hangY').value],width:+$('hangW').value,length:+$('hangL').value,angle:+$('hangAngle').value,planKey:state.plan};
 if(![...rect.origin,rect.width,rect.length,rect.angle].every(Number.isFinite)||rect.width<=0||rect.length<=0){$('hangingStatus').textContent='请输入真实的起角坐标、正数宽度和长度。';$('lockHanging').disabled=true;return;}
 rect.center=hangingCenter(rect);rect.id=state.plan+'-MANUAL-HR'+String((state.lockedRects?.length||0)+1).padStart(3,'0');state.hangingRect=rect;
 $('hangingStatus').textContent=`几何中心 X=${fmt(rect.center[0],6)}，Y=${fmt(rect.center[1],6)} mm；距长向两端均为 ${fmt(rect.length/2,6)} mm，距宽向两边均为 ${fmt(rect.width/2,6)} mm。`;
 $('lockHanging').disabled=false;state.view=[rect.center[0]-Math.max(1800,rect.length),-rect.center[1]-Math.max(1200,rect.width*2),Math.max(3600,rect.length*2),Math.max(2400,rect.width*4)];draw();
}
function pickHangingCorner(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse()),at=[q.x,-q.y];if(!state.rectFirst){state.rectFirst=at;toast('已取第一角点，请点取对角点');return;}
 const first=state.rectFirst,a=+$('hangAngle').value*Math.PI/180,u=[Math.cos(a),Math.sin(a)],v=[-Math.sin(a),Math.cos(a)],d=[at[0]-first[0],at[1]-first[1]],du=d[0]*u[0]+d[1]*u[1],dv=d[0]*v[0]+d[1]*v[1];
 const o=[first[0]+Math.min(0,du)*u[0]+Math.min(0,dv)*v[0],first[1]+Math.min(0,du)*u[1]+Math.min(0,dv)*v[1]];
 $('hangX').value=o[0];$('hangY').value=o[1];$('hangL').value=Math.abs(du);$('hangW').value=Math.abs(dv);state.rectPicking=false;state.rectFirst=null;calculateHanging();
}
function segmentProjection(at,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],ll=dx*dx+dy*dy,t=ll?Math.max(0,Math.min(1,((at[0]-a[0])*dx+(at[1]-a[1])*dy)/ll)):0;return {distance:Math.hypot(at[0]-a[0]-t*dx,at[1]-a[1]-t*dy),angle:Math.atan2(dy,dx)};}
function placementAt(p,at,axisRequired=true){
 if((p.openings||[]).some(o=>isInside(at,o.polygon)||Math.min(...o.polygon.map((a,i)=>segmentProjection(at,a,o.polygon[(i+1)%o.polygon.length]).distance))<150-1e-6))return null;
 if(p.walls.some(w=>isInside(at,w.polygon))||p.rejectedBeams.some(w=>isInside(at,w.polygon)))return null;
 for(const b of p.beams)if(isInside(at,b.polygon)){let best={distance:Infinity,angle:0};const ps=b.centerlinePoints||[b.a,b.b];for(let i=1;i<ps.length;i++){const d=segmentProjection(at,ps[i-1],ps[i]);if(d.distance<best.distance)best=d;}if(axisRequired&&best.distance>.11)return null;return {kind:'梁',data:b,angle:best.angle,signature:['梁',b.width,b.depth,b.thickness,b.elevationOffset]};}
 for(const s of p.slabs)if(isInside(at,s.polygon)&&!(s.holes||[]).some(h=>isInside(at,h)))return {kind:'板',data:s,angle:0,signature:['板',s.thickness,s.elevationOffset]};return null;
}
function recountManual(){
 for(const p of DATA.plans){p.summary.nodes=p.nodes.length;p.summary.commonNodes=p.nodes.filter(n=>n.scope==='common').length;p.summary.independentNodes=p.nodes.length-p.summary.commonNodes;p.summary.inventory=p.nodes.reduce((a,n)=>(a[n.model]=(a[n.model]||0)+1,a),{});p.summary.issues=p.issues.length;p.summary.minimumProven=false;}
 DATA.overlay.pairedCommonNodes=DATA.plans[0].nodes.filter(n=>n.commonId).length;DATA.overlay.pairedOverlapNodes=DATA.plans[0].nodes.filter(n=>n.alignmentPairId).length;
}
function addLockedRect(r){
 const p=DATA.plans.find(p=>p.key===r.planKey);if(!p||p.endSupports.some(e=>e.rectId===r.id))return true;
 const at=hangingCenter(r),hit=placementAt(p,at);if(!hit||hit.kind!=='梁'||Math.abs(hit.data.width-r.width)>.2)return false;
 const other=DATA.plans.find(q=>q.key!==p.key),mateRaw=placementAt(other,at),mateHit=mateRaw?.kind==='梁'?mateRaw:null,required=!!(DATA.meta.alignOverlap&&placementAt(other,at,false));
 const same=required&&mateHit&&JSON.stringify(hit.signature)===JSON.stringify(mateHit.signature),pair='H-'+r.id;
 function put(lp,h){
  let n=lp.nodes.find(n=>Math.hypot(n.at[0]-at[0],n.at[1]-at[1])<1e-7);
  if(!n){n={id:(lp.key==='odd'?'奇':'偶')+'-H'+String(lp.nodes.filter(n=>n.manualCenter).length+1).padStart(3,'0'),at:[...at],kind:h.kind,model:h.data.model,source:h.data.source,owner:h.data.id,cell:h.data.cell,angle:h.angle,scope:same?'common':'independent',zone:'人工挂梁',commonId:same?pair:null,layer:lp.name,signature:h.signature,degree:0,twoWay:false,cross:false,requiredAlignment:required,alignmentPairId:required&&mateHit?pair:null,alignmentPaired:!!(required&&mateHit),alignmentPolicy:required?'人工挂梁重合对应，连接待校核':'人工挂梁中心，按本层独立',connectionRequired:required,manualCenter:true,hangingCenter:true,terminal:false};lp.nodes.push(n);}
  n.hangingCenter=true;
  lp.issues.push({id:(lp.key==='odd'?'奇':'偶')+'-H-Q'+r.id,source:r.id,owner:h.data.id,message:'挂梁小矩形中心已人工锁定；当前最少点证明及横杆连接需重新校核',at:[...at],category:'人工挂梁',scope:n.scope,zone:'人工挂梁',layer:lp.name});
  lp.summary.minimumProven=false;if(DATA.meta.optimization?.[lp.key])DATA.meta.optimization[lp.key].provenMinimum=false;
  return n;
 }
 const node=put(p,hit);if(required&&mateHit)put(other,mateHit);
 p.endSupports.push({id:r.id,rectId:r.id,layer:p.name,owner:hit.data.id,source:'人工指定实际矩形',at:[...at],endAt:r.origin,rectWidth:r.width,rectLength:r.length,rectAngle:r.angle,rectVertices:rectVertices(r),centerError:0,centerPass:true,model:node.model,node:node.id,placed:true,scope:node.scope,zone:node.zone,requiredAlignment:required,alignmentPairId:node.alignmentPairId,cell:node.cell});
 DATA.meta.manualModified=true;recountManual();return true;
}
function applyLockedRectangles(){for(const r of state.lockedRects||[]){if(!r.id.includes('MANUAL'))r.id='MANUAL-'+r.id;addLockedRect(r);}}
function lockHanging(){const r=state.hangingRect;if(!r)return;if(!addLockedRect(r)){$('hangingStatus').textContent='几何中心已精确计算，但未匹配可计算梁轴线、矩形宽度与梁宽不一致，或中心进入洞口150mm避让范围。保留中心标记，请核对真实矩形边界。';return;}
 if(!state.lockedRects.some(q=>q.id===r.id))state.lockedRects.push(JSON.parse(JSON.stringify(r)));
 try{localStorage.setItem('gd-hanging:'+DATA.meta.sourceSHA256,JSON.stringify(state.lockedRects));}catch(e){}
 state.table='endSupports';state.selected={kind:'endSupports',id:r.id};$('hangingStatus').textContent='已锁定在小矩形几何中心；人工修改后的最少点证明和连接另列待重新校核。';render();
}
$('closeHanging').onclick=()=>{$('hangingPanel').hidden=true;state.rectPicking=false;};$('pickHanging').onclick=()=>{state.rectPicking=true;state.rectFirst=null;toast('请在支撑图上点取挂梁矩形的两个对角点');};$('calculateHanging').onclick=calculateHanging;$('lockHanging').onclick=lockHanging;
$('exportHanging').onclick=()=>{if(!state.hangingRect){toast('请先指定挂梁矩形');return;}download('挂梁实际矩形与几何中心.json',new Blob([JSON.stringify({rectangle:state.hangingRect,corners:rectVertices(state.hangingRect),center:hangingCenter(state.hangingRect)},null,2)],{type:'application/json'}));};
state.lockedRects=[];try{const q=JSON.parse(localStorage.getItem('gd-hanging:'+DATA.meta.sourceSHA256)||'[]');if(Array.isArray(q))state.lockedRects=q.filter(r=>Array.isArray(r.origin)&&r.origin.length===2&&r.origin.every(Number.isFinite)&&Number.isFinite(r.width)&&r.width>0&&Number.isFinite(r.length)&&r.length>0&&Number.isFinite(r.angle));}catch(e){}
/* Historical local edits require joint recalculation; do not replay into verified views. */
