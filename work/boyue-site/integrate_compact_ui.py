from pathlib import Path
r=Path(__file__).parent
p=r/'app.js';s=p.read_text(encoding='utf-8')
a=s.index(" else if(sel.kind==='slabs'){");b=s.index(" else if(sel.kind==='endSupports'){",a)
s=s[:a]+''' else if(sel.kind==='slabs'){const q=o.layout;html+=detailPairs([['板厚',o.thickness+' mm'],['实际净跨度',fmt(q.spanX,3)+' × '+fmt(q.spanY,3)+' mm'],['本层规则',q.exempt?'窄跨免加':q.nodeCount===1?'单个居中':q.nodeCount===2?'单排两个':'按本层居中排布'],['本层楼面GD',q.nodeCount],['索引单元格',esc(o.cell)]])+`<div class="formula">X: ${o.indexX}−100=${o.limitX}<br>Y: ${o.indexY}−100=${o.limitY}</div><p class="small-note">${esc(q.reason)}。${q.exempt?'本块不追加楼面固顶；梁下与挂梁端部仍单独计算。':'最近洞边中心距 '+(q.actualMinimumOpeningDistance==null?'无洞口':fmt(q.actualMinimumOpeningDistance,3)+'mm')+'；要求≥150mm。'}</p><button class="example-button" data-example="floorGrid">查看免加 / 居中 / 避洞计算 →</button>`;}
'''+s[b:]
a=s.index(" else if(sel.kind==='endSupports'){");b=s.index("}else if(sel.kind==='arcIntervals')",a)
s=s[:a]+''' else if(sel.kind==='endSupports'){html+=detailPairs([['GL标注',esc(o.gl||'手工指定')],['GL第二尺寸 / 相邻梁高',o.glDimension?o.glDimension+' / '+o.beamDepth+' mm':'手工轮廓'],['比较',esc(o.comparison||'手工指定，另行核对')],['实际矩形宽 × 长',fmt(o.rectWidth,3)+' × '+fmt(o.rectLength,3)+' mm'],['几何中心X / Y',o.at.map(v=>fmt(v,6)).join(' / ')],['中心误差',fmt(o.centerError||0,6)+' mm'],['GD型号',esc(o.model)],['支撑编号',esc(o.node||'未落点')],['已落在中心',pill(o.placed&&o.centerPass)],['距洞口中心避让',o.openingDistance==null?'无邻近洞口':fmt(o.openingDistance,3)+' mm；'+(o.clearancePass?'满足150mm':'冲突待处理')],['轮廓来源',esc((o.boundarySources||[o.source]).join(' / '))]])+`<p class="small-note">${esc(o.recognition||'手工输入实际矩形')}。中心由实际四角计算，不用GL尺寸差推算长度，不使用固定50mm退距。</p>`;
'''+s[b:]
s=s.replace("if(type==='beamEnd'){openHangingTool();return;}","if(type==='beamEnd'){baselineMode(false);state.overlay=false;setStep(5);state.table='endSupports';const e=plan().endSupports.find(e=>e.placed)||plan().endSupports[0];if(e)select('endSupports',e.id,true);else openHangingTool();return;}")
s=s.replace("out.push(hangingOverlay());","out.push(hangingOverlay());out.push(compactHangingOverlay());")
s=s.replace(" if(s>=4){out.push("," out.push(compactOpeningOverlay());if(s>=4){out.push(")
s=s.replace("o.grid?.passed","o.layout?.passed")
s=s.replace("关闭时优化点数","关闭时居中减量")
s=s.replace("按区域选择对齐，楼面保持井字形","按区域选择对齐，保留窄跨和单排例外")
s=s.replace("关闭时优化点数","关闭时居中减量")
s=s.replace("两种情况都保留单楼面井字网格。","免加、居中单排与洞口150mm优先。")
s=s.replace("每块楼面至少两行两列，并检查逐点横纵连接与闭合矩形单元；数量在井字形约束内比较并整排减量，未证明全局最少。人工锁定中心后需重新校核。","先判窄跨免加；其余允许单个、单排两个或常规阵列，按本层间距居中布置，固顶中心距洞口边至少150mm，不强制补成井字。人工修改后需重新校核。")
s=s.replace("无论是否跨层对齐，单个楼面均使用整排整列网格，保留闭合矩形单元和逐点横纵连接，并验证真实边界覆盖。规则候选比较和异形区整排减量不等于全局最少证明；旧版没有井字约束的最少点证明已撤销。","任一方向净跨度小于对应Sx/Sy时，本块楼面按用户规则免加；其余计算允许单排、单个或两个，不强制井字。支撑按中心对称展开，避开洞口实体边界150mm。对齐不覆盖这些例外，不能兼顾的连接另列待复核，不宣称全局最少。")
s=s.replace("重合区开启时共同计算楼面轴线并检查对应连接，关闭时两层各自计算井字网格","重合区开启时检查可放置的同坐标对应，关闭时按本层计算；窄跨免加、居中单排与洞口150mm优先")
s=s.replace("[p.summary.nodes-p.summary.twoWayNodes,p.name+'连接待复核',true]","[p.nodes.filter(n=>n.requiredAlignment&&!n.alignmentPaired).length,p.name+'对应待复核',true]")
s=s.replace("井字形的横纵连通和闭合单元","免加、居中单排与洞口150mm")
s=s.replace("pill(o.check.SpacingPass&&o.check.EdgePass)","o.layout?.exempt?'免加':pill(o.check.SpacingPass&&o.check.EdgePass)")
p.write_text(s,encoding='utf-8')
p=r/'v5-controls.js';s=p.read_text(encoding='utf-8');a=s.index('function renderOptimizationSummary()');b=s.index('\nfunction alignmentLabel()',a)
s=s[:a]+'''function renderOptimizationSummary(){const p=plan();$('optimizationSummary').innerHTML=`<b>${DATA.meta.manualModified?'人工修改后待重新校核':'居中 / 免加 / 避洞规则 '+p.summary.floorLayoutPass+' / '+p.summary.floorCount+' 块已计算'}</b>窄跨免加 ${p.summary.exemptFloors} 块；单个 ${p.summary.singleFloors} 块；两个 ${p.summary.twoFloors} 块。<br>挂梁实际矩形中心已放 ${p.summary.endSupportsPlaced} / ${p.summary.beamEnds} 处；固顶中心距洞边≥150mm。<br>梁下、挂梁和楼面分别计量；对应连接、索引缺项等见复核清单。`;}'''+s[b:]
p.write_text(s,encoding='utf-8')
p=r/'template.html';s=p.read_text(encoding='utf-8')
s=s.replace('每块楼面横纵连成井字网格；对齐、不对齐都保留本层完整连接，逐块展示排数、间距、边距与校核。','窄跨免加，允许单个或单排两个；按本层间距居中，固顶中心避洞150mm。挂梁按GL比较及端部实际矩形取中心。')
s=s.replace('楼面井字与计算 ↗','楼面减量与避洞 ↗').replace('本层井字网格减量','本层居中减量').replace('单块楼面 · 井字形计算','单块楼面 · 免加、居中、避洞计算').replace('井字计算对比范围','楼面计算对比范围')
s=s.replace('<span>本次补算</span>','<span>本次补算</span><button class="button" data-compact-example="narrow">650窄跨免加 ↗</button><button class="button" data-compact-example="two">两个固顶 ↗</button><button class="button" data-compact-example="opening">洞口避让150 ↗</button>')
s=s.replace('<button class="button" data-example="beamEnd">挂梁矩形取中心 ↗</button>','<button class="button" data-example="beamEnd">GL挂梁端部中心 ↗</button><button class="button" data-manual-hanging>手工指定矩形</button>')
s=s.replace('<option>人工挂梁</option>','<option>人工挂梁</option><option>挂梁识别</option>')
p.write_text(s,encoding='utf-8')
