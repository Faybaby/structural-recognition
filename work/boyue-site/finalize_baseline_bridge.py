from pathlib import Path
R=Path(__file__).parent
p=R/'app.js';s=p.read_text(encoding='utf-8')
s=s.replace('let baselineReady=false,baselinePending=null;','let baselineReady=false,baselineStarted=false,baselinePending=null;')
s=s.replace("if(on&&!$('baselineFrame').src)$('baselineFrame').srcdoc=BASELINE_HTML;", "if(on&&!baselineStarted){baselineStarted=true;$('baselineFrame').srcdoc=BASELINE_HTML;}")
s=s.replace("$('scene').innerHTML=out.join('');", "if(state.baselinePoint){const q=state.baselinePoint.at;out.push(`<path d=\"M${q[0]-250},${-q[1]}h500M${q[0]},${-q[1]-250}v500\" fill=\"none\" stroke=\"#d98915\" stroke-width=\"2\" vector-effect=\"non-scaling-stroke\"/><text x=\"${q[0]+180}\" y=\"${-q[1]-180}\" font-size=\"130\" fill=\"#a56b14\">基准点参考</text>`);}$('scene').innerHTML=out.join('');")
p.write_text(s,encoding='utf-8')
p=R/'baseline-tool.html';s=p.read_text(encoding='utf-8')
s=s.replace('<div class="row"><button class="btn" id="returnSupport">','<div class="row"><button class="btn pri" id="projectOdd">本项目奇数层</button><button class="btn pri" id="projectEven">本项目偶数层</button><button class="btn" id="returnSupport">')
s=s.replace("  tellParent({type:'gd:baseline-ready'});", "  document.getElementById('projectOdd').onclick=()=>{if(window.BP_PROJECTS)loadModel(BP_PROJECTS.odd.model,BP_PROJECTS.odd.name);};\n  document.getElementById('projectEven').onclick=()=>{if(window.BP_PROJECTS)loadModel(BP_PROJECTS.even.model,BP_PROJECTS.even.name);};")
s=s.replace("else if (window.BP_SAMPLES && window.BP_SAMPLES.dwg) $('#hint').hidden = false; }", "else if (window.BP_SAMPLES && window.BP_SAMPLES.dwg) $('#hint').hidden = false; tellParent({type:'gd:baseline-ready'}); }")
p.write_text(s,encoding='utf-8')
p=R/'build.py';s=p.read_text(encoding='utf-8')
insert='''
bundle=json.loads(data)
projects={}
for p in bundle['variants']['independent']['plans']:
 flip=lambda poly:[[q[0],-q[1]] for q in poly]
 shared=bundle.get('sharedPlans',{}).get(p['key'],{})
 model=dict(kind='2d',name='铂悦府6号_'+p['name'],how='project',projectPlanKey=p['key'],plates=[dict(id=p['key']+'_'+s['id'],poly=flip(s['polygon']),ang=0) for s in p['slabs']],holes=[flip(h) for s in p['slabs'] for h in s.get('holes',[])],walls=[flip(w['polygon']) for w in p.get('walls',shared.get('walls',[]))],beams=[flip(b['polygon']) for b in p['beams']],meta=dict(T=dict(ox=p['offsetX'],sx=1,oy=0,sy=-1,note='本项目局部坐标转DWG原坐标')))
 projects[p['key']]=dict(model=model,name='铂悦府6号 '+p['name'])
project_script='<script>window.BP_PROJECTS='+json.dumps(projects,ensure_ascii=False).replace('</',r'<\\/')+';window.BP_PRELOAD=BP_PROJECTS.odd;</script>'
baseline=baseline.replace('<script>/* 基准点插件 · 页面',project_script+'<script>/* 基准点插件 · 页面')
'''
s=s.replace("js='const BASELINE_HTML=",insert+"\njs='const BASELINE_HTML=")
p.write_text(s,encoding='utf-8')
