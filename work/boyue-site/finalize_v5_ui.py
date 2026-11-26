from pathlib import Path
R=Path(__file__).parent
p=R/'app.js';s=p.read_text(encoding='utf-8')
s=s.replace("draw();selection();table();}\nfunction focusObject", "renderOptimizationSummary();draw();selection();table();}\nfunction focusObject")
s=s.replace("function baselineMode(on){", "function baselineMode(on){document.body.classList.toggle('baseline-active',on);if(on)$('hangingPanel').hidden=true;")
start=s.index("if(kind==='endSupports'){");end=s.index("else if(kind==='arcIntervals')",start)
s=s[:start]+"if(kind==='endSupports'){head=['矩形编号','层别','关联梁','来源','挂梁宽Wmm','挂梁长Lmm','中心Xmm','中心Ymm','中心误差mm','支撑编号','型号','当前校核状态'];data=rows().map(o=>[o.id,o.layer,o.owner,o.source,o.rectWidth,o.rectLength,...o.at,o.centerError,o.node,o.model,'人工锁定后待重新校核']);}"+s[end:]
s=s.replace("挂梁端部支撑 →", "挂梁矩形中心 →")
p.write_text(s,encoding='utf-8')
p=R/'template.html';s=p.read_text(encoding='utf-8').replace('<div class="metrics" id="metrics"></div>','<div class="metrics" id="metrics"></div><div id="optimizationSummary" class="optimization-summary"></div>')
s=s.replace('<option>梁端检查</option>','<option>梁端检查</option><option>人工挂梁</option>')
p.write_text(s,encoding='utf-8')
with (R/'style.css').open('a',encoding='utf-8') as f:f.write('\n.optimization-summary{font-size:10px;line-height:1.9;padding:10px;border:1px solid #d4e1cf;border-radius:7px;background:#f2f7ef;color:#587250;margin:10px 0}.optimization-summary b{display:block;color:#385438}.baseline-active .alignment-control,.baseline-active .curve-shortcuts{display:none}\n')
p=R/'v5-controls.js';s=p.read_text(encoding='utf-8')
fn='''function renderOptimizationSummary(){const p=plan(),q=DATA.meta.optimization?.[p.key];if(!q){$('optimizationSummary').innerHTML='';return;}const status=DATA.meta.manualModified?'人工锁定中心后，最少点证明待重新校核':q.provenMinimum?'已证明当前候选点集内最少':q.status==='alignment-reference'?'对齐参考方案':'已优化，最少点证明未完成';$('optimizationSummary').innerHTML=`<b>${esc(status)}</b>对齐参考 ${q.referenceCount} → 当前 ${p.nodes.length} 根候选<br>${q.candidateCount?'候选点集 '+q.candidateCount+' 点；':''}关闭对齐的区域独立优化。<br>不含未识别、表外尺寸；连接和结构构造仍按复核清单处理。`;}
'''
s=fn+s
p.write_text(s,encoding='utf-8')
