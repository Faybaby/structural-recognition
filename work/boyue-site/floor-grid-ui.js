function floorGridMini(p,s){
 const g=s.grid;if(!g)return '';
 const b=g.bounds,pad=Math.max(b[2]-b[0],b[3]-b[1])*.12+80;
 const nodes=p.nodes.filter(n=>n.kind==='板'&&n.owner===s.id);
 const outline=path(s.polygon)+(s.holes||[]).map(h=>path(h)).join('');
 return `<svg class="floor-mini" viewBox="${b[0]-pad} ${-b[3]-pad} ${b[2]-b[0]+pad*2} ${b[3]-b[1]+pad*2}" aria-label="${esc(p.name+s.id)}井字形网格"><path d="${outline}" fill="#edf3ef" fill-rule="evenodd" stroke="#9ca99d" stroke-width="1" vector-effect="non-scaling-stroke"/><g stroke="#2a8172" stroke-width="1.7" fill="none">${g.links.map(l=>`<path d="${path(l,false)}" vector-effect="non-scaling-stroke"/>`).join('')}</g><g fill="#fff" stroke="#2a8172" stroke-width="1.4">${nodes.map(n=>`<circle cx="${n.at[0]}" cy="${-n.at[1]}" r="${Math.max(18,Math.min(b[2]-b[0],b[3]-b[1])*.018)}" vector-effect="non-scaling-stroke"/>`).join('')}</g></svg>`;
}
function floorGridCard(p,s,aligned,all=false){
 const g=s.grid;if(!g)return '<p>尚无井字形校核记录</p>';if(DATA.meta.manualModified)return '<p>人工修改了支撑中心；当前楼面井字形、间距与连接需要重新校核。</p>';
 const nx=Math.max(2,Math.ceil(g.spanX/s.limitX)-1),ny=Math.max(2,Math.ceil(g.spanY/s.limitY)-1);
 return `<article class="floor-case"><div class="floor-case-head"><b>${all?'两类区域均':'重合区'}${aligned?'对齐':'不对齐'}</b><span>${g.nodeCount} 个楼面支撑</span></div>${floorGridMini(p,s)}<ol class="method-list floor-calc-steps"><li><b>读取本层楼面</b> ${esc(p.name)} · ${esc(s.id)}；板厚 ${s.thickness}mm，外包净跨度 X=${fmt(g.spanX,3)}、Y=${fmt(g.spanY,3)}mm；洞口、凹角及圆弧按实际边界处理。</li><li><b>查索引并扣减</b><code>${esc(s.cell)}</code><div class="formula">Sx=${s.indexX}−100=${s.limitX}mm<br>Sy=${s.indexY}−100=${s.limitY}mm</div></li><li><b>确定起排并比较网格</b> 每方向至少2排；起排参考 nx=max(2,ceil(${fmt(g.spanX)}/${s.limitX})−1)=${nx}，ny=max(2,ceil(${fmt(g.spanY)}/${s.limitY})−1)=${ny}。比较 ${g.candidateSchemes} 个规则候选，洞口和异形区按整排补齐、减量；起排数不直接当作最终根数。</li><li><b>${aligned?'叠加对位并补齐横纵排':'按本层井字网格布置'}</b> ${aligned?'对应组：'+esc(g.alignmentGroup)+'；对应梁投影等锁定锚点 '+g.alignmentAnchors+' 个，补入X/Y轴线并完成矩形单元。'+(all?'非重合区延续参考轴网：X=450+'+Math.min(s.limitX,900)+'k，Y=450+'+Math.min(s.limitY,900)+'k（mm，k为整数）；间距不超过本层上限，异形边界另补排。':''):'关闭跨层强制对应；保留本层的横向和纵向完整连接。'}<br>实际 ${g.columns} 列 × ${g.rows} 行；裁剪后 ${g.nodeCount} 个节点、${g.cellCount} 个闭合矩形单元。洞口和边界使节点数可能小于行×列。</li><li><b>计算间距和边距</b> 全局相邻轴线最大 X=${fmt(g.maxGridX,3)}、Y=${fmt(g.maxGridY,3)}mm；外包边距左/右 ${fmt(g.leftMargin,3)}/${fmt(g.rightMargin,3)}mm，下/上 ${fmt(g.bottomMargin,3)}/${fmt(g.topMargin,3)}mm。实际边界另作全区域覆盖校验，含洞口和弧边。<details><summary>展开每条X/Y轴线坐标（局部mm）</summary><p>X：${g.xCoordinates.map(x=>fmt(x,3)).join('，')}</p><p>Y：${g.yCoordinates.map(y=>fmt(y,3)).join('，')}</p></details></li><li><b>井字形逐点校验</b> 横纵连接 ${g.horizontalVerticalPass?'通过':'待复核'}；孤立节点 ${g.isolated}；连通片 ${g.components}；连接 ${g.linkCount} 条；独立回路 ${g.cycleRank} 个；真实边界覆盖 ${g.coveragePass?'通过':'待复核'}。</li></ol><p class="small-note">数量仅含本楼面GD支撑；梁下支撑单独统计。规则网格比较与整排减量已完成，当前未证明全局最少。</p></article>`;
}
function renderFloorGrid(){
 const el=$('floorGridPanel');if(!el)return;
 const p=plan();const choices=$('floorGridSelect');const chosen=state.selected?.kind==='slabs'?state.selected.id:state.floorGridId;
 const id=p.slabs.some(s=>s.id===chosen)?chosen:(p.slabs.find(s=>s.curvedBoundary)?.id||p.slabs[0].id);state.floorGridId=id;
 choices.innerHTML=p.slabs.map(s=>`<option value="${s.id}" ${s.id===id?'selected':''}>${p.name} ${s.id} · h=${s.thickness}${s.curvedBoundary?' · 圆弧':''}</option>`).join('');
 const all=$('floorCompareScope').value==='all';
 const leftMode=all?'separate':DATA.meta.alignNonOverlap?'nonoverlapOnly':'separate',rightMode=all?'aligned':DATA.meta.alignNonOverlap?'aligned':'independent';
 const lp=BUNDLE.variants[leftMode].plans.find(q=>q.key===p.key),rp=BUNDLE.variants[rightMode].plans.find(q=>q.key===p.key);
 const ls=lp.slabs.find(s=>s.id===id),rs=rp.slabs.find(s=>s.id===id);
 $('floorGridCurrent').textContent=all?'并列比较同一楼面：重合区、非重合区均不对齐 / 均对齐。主图仍按顶部两个开关显示。':`沿用当前非重合区${DATA.meta.alignNonOverlap?'延续对齐':'独立布置'}；并列比较同一楼面重合区不对齐 / 对齐。`;
 $('floorGridCases').innerHTML=floorGridCard(lp,ls,false,all)+floorGridCard(rp,rs,true,all);
 $('floorGridDelta').textContent=`${p.name} ${id}：不对齐 ${ls.grid?.nodeCount??'—'} → 对齐 ${rs.grid?.nodeCount??'—'} 个；增减 ${ls.grid&&rs.grid?rs.grid.nodeCount-ls.grid.nodeCount:'—'} 个。井字形约束始终保留。`;
}
function openFloorGrid(id){baselineMode(false);full(false);if(id)state.floorGridId=id;renderFloorGrid();$('floorGridPanel').scrollIntoView({block:'start',behavior:'smooth'});}
$('floorGridSelect').onchange=e=>{state.floorGridId=e.target.value;state.selected=null;renderFloorGrid();};
$('floorCompareScope').onchange=renderFloorGrid;
$('focusFloorGrid').onclick=()=>{state.overlay=false;setStep(5);select('slabs',state.floorGridId,true);$('drawingCard').scrollIntoView({block:'start',behavior:'smooth'});};
$('exportFloorGrid').onclick=()=>{const p=plan(),id=state.floorGridId;const cases=Object.fromEntries(Object.entries(BUNDLE.variants).map(([mode,v])=>{const pp=v.plans.find(q=>q.key===p.key),s=pp.slabs.find(q=>q.id===id);return [mode,{layer:pp.name,slab:id,indexCell:s.cell,indexX:s.indexX,indexY:s.indexY,reduction:100,limitX:s.limitX,limitY:s.limitY,grid:s.grid}];}));download('铂悦府_'+p.name+'_'+id+'_井字形计算步骤.json',new Blob([JSON.stringify(cases,null,2)],{type:'application/json'}));};
renderFloorGrid();
