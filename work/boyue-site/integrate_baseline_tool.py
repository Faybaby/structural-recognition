from pathlib import Path
import re,hashlib
R=Path(__file__).parent
source=Path('C:/Users/Administrator/Documents/xwechat_files/wxid_3v1gew46nx6z22_969d/msg/file/2026-11/基准点插件_本地版.html')
s=source.read_text(encoding='utf-8-sig')
assert 'function loadModel(model, name, opt)' in s and 'window.BPCore' in s
# Retain the bundled algorithms, local DWG/WASM reader, and all third-party notices.
s=s.replace('<title>基准点插件（本地版）</title>','<title>基准点工具 · 铂悦府</title>')
s=s.replace('<h1>基准点插件</h1>','<h1>基准点工具</h1><div class="row"><button class="btn" id="returnSupport">返回固顶布置</button><button class="btn pri" id="markSupport">将当前推荐基准点标记到支撑图</button></div>')
bridge='''
  function tellParent(data){if(parent!==window)parent.postMessage(data,location.origin==='null'?'*':location.origin);}
  window.addEventListener('message',e=>{
    if(e.source!==parent || (location.origin!=='null' && e.origin!==location.origin))return;
    const q=e.data;if(!q || q.type!=='gd:load-baseline' || !q.model || !Array.isArray(q.model.plates))return;
    loadModel(q.model,q.name||'铂悦府项目');S.model.projectPlanKey=q.planKey;
  });
  document.getElementById('returnSupport').onclick=()=>tellParent({type:'gd:return-support'});
  document.getElementById('markSupport').onclick=()=>{
    const F=fam(),g=F&&F.grids&&F.grids[0];
    if(!g){status('请先加载底图并计算整体基准点',true);return;}
    tellParent({type:'gd:baseline-point',planKey:S.model.projectPlanKey,at:[g.pg[0],-g.pg[1]],name:g.tag||g.nm||'推荐基准点'});
  };
  tellParent({type:'gd:baseline-ready'});
'''
s=s.replace("  if (document.readyState === 'loading')",bridge+"\n  if (document.readyState === 'loading')")
(R/'baseline-tool.html').write_text(s,encoding='utf-8')
(R/'baseline-source-sha256.txt').write_text(hashlib.sha256(source.read_bytes()).hexdigest()+'  基准点插件_本地版.html\n',encoding='utf-8')
p=R/'template.html';h=p.read_text(encoding='utf-8')
h=h.replace(' <nav class="steps"',' <div class="workspace-tabs"><button class="button primary" id="supportWorkspace">固顶布置</button><button class="button" id="baselineWorkspace">基准点工具</button><span>整体基准点 · 切割判断 · 每块板局部基准点</span></div><section id="baselinePanel" hidden><div class="baseline-toolbar"><b>基准点工具</b><button class="button" id="baselineOdd">加载本项目奇数层</button><button class="button" id="baselineEven">加载本项目偶数层</button><span id="baselineStatus">可载入本项目板区，也可在工具中选择 DWG / DXF / STEP 文件。</span></div><iframe id="baselineFrame" title="基准点计算工具" sandbox="allow-scripts allow-same-origin allow-downloads" loading="lazy"></iframe></section><div id="supportPanel"><nav class="steps"',1)
h=h.replace(' <footer>',' </div><footer>',1)
p.write_text(h,encoding='utf-8')
with (R/'style.css').open('a',encoding='utf-8') as f:f.write('\n.workspace-tabs{display:flex;align-items:center;gap:9px;margin:16px 0}.workspace-tabs span{font-size:11px;color:#718174}.baseline-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:9px;padding:12px;border:1px solid var(--line);border-radius:9px;background:white}.baseline-toolbar span{font-size:11px;color:#718174}#baselineFrame{display:block;width:100%;height:1150px;border:1px solid var(--line);border-radius:10px;background:white;margin:12px 0}\n')
with (R/'app.js').open('a',encoding='utf-8') as f:f.write('''
let baselineReady=false,baselinePending=null;
function baselineMode(on){$('baselinePanel').hidden=!on;$('supportPanel').hidden=on;$('baselineWorkspace').classList.toggle('primary',on);$('supportWorkspace').classList.toggle('primary',!on);if(on&&!$('baselineFrame').src)$('baselineFrame').srcdoc=BASELINE_HTML;}
function sendBaseline(key){const p=DATA.plans.find(p=>p.key===key);const flip=poly=>poly.map(q=>[q[0],-q[1]]);const model={kind:'2d',name:'铂悦府6号_'+p.name,how:'project',plates:p.slabs.map(s=>({id:p.key+'_'+s.id,poly:flip(s.polygon),ang:0})),holes:p.slabs.flatMap(s=>(s.holes||[]).map(flip)),walls:p.walls.map(w=>flip(w.polygon)),beams:p.beams.map(b=>flip(b.polygon)),meta:{T:{ox:p.offsetX,sx:1,oy:0,sy:-1,note:'当前层局部坐标转换回DWG原图坐标'}}};const q={type:'gd:load-baseline',model,name:'铂悦府6号 '+p.name,planKey:p.key};if(!baselineReady){baselinePending=q;baselineMode(true);}else $('baselineFrame').contentWindow.postMessage(q,location.origin==='null'?'*':location.origin);$('baselineStatus').textContent='已载入'+p.name+' '+p.slabs.length+'个板区；沿用基准点工具原有计算规则。';}
$('baselineWorkspace').onclick=()=>{baselineMode(true);if(!baselineReady)baselinePending={projectKey:state.plan};};$('supportWorkspace').onclick=()=>baselineMode(false);$('baselineOdd').onclick=()=>sendBaseline('odd');$('baselineEven').onclick=()=>sendBaseline('even');
window.addEventListener('message',e=>{if(e.source!==$('baselineFrame').contentWindow||(location.origin!=='null'&&e.origin!==location.origin))return;const q=e.data;if(!q)return;if(q.type==='gd:baseline-ready'){baselineReady=true;if(baselinePending){if(baselinePending.projectKey)sendBaseline(baselinePending.projectKey);else $('baselineFrame').contentWindow.postMessage(baselinePending,location.origin==='null'?'*':location.origin);baselinePending=null;}}if(q.type==='gd:return-support')baselineMode(false);if(q.type==='gd:baseline-point'&&Array.isArray(q.at)&&q.at.length===2&&q.at.every(Number.isFinite)){state.baselinePoint=q;state.plan=DATA.plans.some(p=>p.key===q.planKey)?q.planKey:state.plan;baselineMode(false);render();toast('已标记基准点；支撑数量尚未因该标记重算');}});
''')
p=R/'build.py';s=p.read_text(encoding='utf-8');s=s.replace("html=template.replace", "baseline=(root/'baseline-tool.html').read_text(encoding='utf-8')\njs='const BASELINE_HTML='+json.dumps(baseline,ensure_ascii=False).replace('</',r'<\\/')+';\\n'+(root/'app.js').read_text(encoding='utf-8')\nhtml=template.replace")
s=s.replace("(root/'app.js').read_text(encoding='utf-8'))","js)")
# Emit the separate source as well as the embedded offline tool.
s=s.replace("(root/'dist/index.html').write_text(html,encoding='utf-8')","(root/'dist/index.html').write_text(html,encoding='utf-8')\n(root/'dist/baseline-tool.html').write_text(baseline,encoding='utf-8')")
p.write_text(s,encoding='utf-8')
print('Integrated local baseline tool; original SHA256 retained')
