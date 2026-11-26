from pathlib import Path
r=Path(__file__).parent
p=r/'template.html';s=p.read_text(encoding='utf-8')
s=s.replace('<span>本次补算</span>','<span>本次补算</span><button class="button" data-example="floorGrid">楼面井字与计算 ↗</button>')
pane='''<section id="floorGridPanel" class="floor-grid-panel"><div class="section-title"><div><p class="eyebrow">FLOOR GRID · STEP BY STEP</p><h2>单块楼面 · 井字形计算</h2><p id="floorGridCurrent"></p></div><div class="table-actions"><select id="floorGridSelect" aria-label="选择楼面计算"></select><button class="button" id="focusFloorGrid">定位这块楼面</button><button class="button" id="exportFloorGrid">导出计算步骤 JSON</button></div></div><p id="floorGridDelta" class="floor-delta"></p><div id="floorGridCases" class="floor-case-grid"></div></section>'''
s=s.replace('<section class="data-section">',pane+'<section class="data-section">')
s=s.replace('挂梁按小矩形真实长宽居中；重合区、非重合区分别选择对齐，关闭时按本层约束优化支撑点数。','每块楼面横纵连成井字网格；对齐、不对齐都保留本层完整连接，逐块展示排数、间距、边距与校核。')
p.write_text(s,encoding='utf-8')
p=r/'app.js';s=p.read_text(encoding='utf-8')
s=s.replace("function example(type){let p=plan();", "function example(type){let p=plan();if(type==='floorGrid'){openFloorGrid();return;}")
s=s.replace("renderOptimizationSummary();draw();selection();table();}","renderOptimizationSummary();draw();selection();table();renderFloorGrid();}")
s=s.replace("selection();draw();table();}\n", "selection();draw();table();renderFloorGrid();}\n")
s=s.replace("+'；最少点结论仅限当前候选点集。'", "+'；两种情况都保留单楼面井字网格。'")
s=s.replace('最少点证明只适用于当前有限候选点集；人工锁定中心后另列为待重新校核。','每块楼面至少两行两列，并检查逐点横纵连接与闭合矩形单元；数量在井字形约束内比较并整排减量，未证明全局最少。人工锁定中心后需重新校核。')
s=s.replace('按区域选择对齐，关闭时优化点数','按区域选择对齐，楼面保持井字形')
s=s.replace('关闭对齐时使用有限候选点集的二元数量最小化，并验证本层板区覆盖、梁中心线间距与端距。未识别或索引缺失的区域不在最少点证明范围内。','无论是否跨层对齐，单个楼面均使用整排整列网格，保留闭合矩形单元和逐点横纵连接，并验证真实边界覆盖。规则候选比较和异形区整排减量不等于全局最少证明；旧版没有井字约束的最少点证明已撤销。')
s=s.replace("if(s>=4){for(const layer of layers)","if(s>=4){out.push(`<g fill=\"transparent\" stroke=\"none\">${p.slabs.map(b=>`<path data-pick=\"slabs:${b.id}\" d=\"${path(b.polygon)+(b.holes||[]).map(h=>path(h)).join('')}\" fill-rule=\"evenodd\"/>`).join('')}</g>`);for(const layer of layers)")
needle="+detailPairs([['本层节点',o.check.NodeCount],['布置检查',pill(o.check.SpacingPass&&o.check.EdgePass)]]);"
s=s.replace(needle,"+detailPairs([['本层节点',o.check.NodeCount],['井字形检查',pill(o.grid?.passed)],['横纵行列',(o.grid?.columns||'—')+'列 × '+(o.grid?.rows||'—')+'行'],['闭合矩形单元',o.grid?.cellCount??'—'],['布置检查',pill(o.check.SpacingPass&&o.check.EdgePass)]])+`<button class=\"example-button\" data-example=\"floorGrid\">查看这块楼面对齐 / 不对齐的计算 →</button>`;")
p.write_text(s,encoding='utf-8')
p=r/'v5-controls.js';s=p.read_text(encoding='utf-8');start=s.index('function renderOptimizationSummary()');end=s.index('\nfunction alignmentLabel()',start)
s=s[:start]+'''function renderOptimizationSummary(){const p=plan();$('optimizationSummary').innerHTML=`<b>单楼面井字形 ${p.summary.gridPass??0} / ${p.summary.gridFloors??p.slabs.length} 块通过</b>每个楼面支撑有横、纵连接，保留闭合矩形单元。<br>当前 ${p.nodes.length} 根候选（含梁下）；规则网格比较与整排减量，未证明全局最少。<br>${DATA.meta.manualModified?'人工修改后需要重新校核。':''}索引缺项、标高和梁板连接等仍见复核清单。`;}'''+s[end:]
p.write_text(s,encoding='utf-8')
p=r/'style.css';s=p.read_text(encoding='utf-8')+'''
.floor-grid-panel{margin:28px 0;padding:24px;background:#fbfcf8;border:1px solid #d9e1d7;border-radius:14px;scroll-margin-top:20px}.floor-grid-panel .section-title{align-items:start;gap:18px}.floor-grid-panel h2{margin:8px 0}.floor-grid-panel select{max-width:285px;min-height:38px;padding:6px 12px;border:1px solid #d1dbcf;border-radius:7px;background:white}.floor-case-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.floor-case{border:1px solid #d7e1d4;background:white;border-radius:10px;padding:18px;min-width:0}.floor-case-head{display:flex;justify-content:space-between;gap:12px}.floor-case-head span{color:#236f60;font-weight:700}.floor-mini{display:block;width:100%;height:270px;margin:12px 0;background:#f7f9f4;border-radius:6px}.floor-calc-steps li{font-size:13px;line-height:1.8;margin:14px 0}.floor-calc-steps li b{display:block;color:#25453a}.floor-calc-steps code{overflow-wrap:anywhere;display:block}.floor-calc-steps details{margin-top:8px;padding:8px;background:#f5f7f1;overflow-wrap:anywhere}.floor-delta{padding:12px 16px;background:#e9f2eb;border-left:3px solid #3a8b73}.floor-grid-panel .table-actions{flex-wrap:wrap;justify-content:flex-end}@media(max-width:850px){.floor-case-grid{grid-template-columns:1fr}.floor-grid-panel{padding:14px}.floor-grid-panel .section-title{display:block}.floor-mini{height:230px}}
''';p.write_text(s,encoding='utf-8')
