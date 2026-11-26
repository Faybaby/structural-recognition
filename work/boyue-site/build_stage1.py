from pathlib import Path
import json
root=Path(__file__).parent
source=root/'stage1'
page=(source/'template.html').read_text(encoding='utf8')
page=page.replace('/*CSS*/',(source/'style.css').read_text(encoding='utf8'))
page=page.replace('/*DATA*/',(source/'projects/hangzhou/data.json').read_text(encoding='utf8').replace('</','<\\/'))
page=page.replace('/*FLOOR_WORKER*/',(root/'floor-worker.bundle.js').read_text(encoding='utf8').replace('</script','<\\/script'))
page=page.replace('/*RACK_WORKER*/',(root/'rack-worker.bundle.js').read_text(encoding='utf8').replace('</script','<\\/script'))
page=page.replace('/*JS*/',(root/'stage1.bundle.js').read_text(encoding='utf8').replace('</script','<\\/script'))
assert '/*DATA*/' not in page and '/*JS*/' not in page
hosting=json.loads((root/'.openai/hosting.json').read_text(encoding='utf8'))
dist=root/hosting['static']['directory']
dist.mkdir(exist_ok=True)
(dist/'index.html').write_text(page,encoding='utf8')
out=root.parent.parent/'outputs';out.mkdir(exist_ok=True)
(out/'杭州5号楼_4层基本模型.html').write_text(page,encoding='utf8')
print(json.dumps({'bytes':len(page.encode('utf8')),'stage':1,'standalone':True}))
