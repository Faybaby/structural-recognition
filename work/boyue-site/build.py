from pathlib import Path
import json,base64
root=Path(__file__).parent
model_data=(root/'model3d-data.json').read_text(encoding='utf8')
data=json.loads(model_data)
baseline=(root/'baseline-tool.html').read_text(encoding='utf8')
projects={p['key']:dict(model=p['baseline']['model'],name='铂悦府6号 '+p['name']+' 三维承托面') for p in data['plans']}
preload='<script>window.BP_PROJECTS='+json.dumps(projects,ensure_ascii=False).replace('</',r'<\/')+';window.BP_PRELOAD=BP_PROJECTS.odd;</script>'
baseline=baseline.replace('<script>/* 基准点插件 · 页面',preload+'<script>/* 基准点插件 · 页面')
exports={k:base64.b64encode((root/'dist/model3d-dwg'/(k+'.dwg')).read_bytes()).decode() for k in ['odd','even','both']}
js='const BASELINE_HTML='+json.dumps(baseline,ensure_ascii=False).replace('</',r'<\/')+';\nwindow.MODEL3D_DWG='+json.dumps(exports)+';\n'+(root/'model3d.bundle.js').read_text(encoding='utf8')
worker=json.dumps((root/'model3d.worker.js').read_text(encoding='utf8')).replace('</',r'<\/')
scripts='<script id="model3d-worker" type="application/json">'+worker+'</script><script id="model3d-data" type="application/json">'+model_data.replace('</',r'<\/')+'</script>'
html=(root/'template.html').read_text(encoding='utf8').replace('/*__CSS__*/',(root/'style.css').read_text(encoding='utf8')+'\n'+(root/'model3d/style.css').read_text(encoding='utf8')).replace('<script id="project-data"',scripts+'<script id="project-data"').replace('/*__JS__*/',js)
(root/'dist/index.html').write_text(html,encoding='utf8')
(root/'dist/baseline-tool.html').write_text(baseline,encoding='utf8')
out=root.parent.parent/'outputs'
for name in ['铂悦府6号_固顶布置全过程.html','铂悦府6号_问题1修改_三维计算.html']:(out/name).write_text(html,encoding='utf8')
print(json.dumps({'bytes':len(html.encode()),'nodes':sum(len(p['nodes']) for p in data['plans'])}))
