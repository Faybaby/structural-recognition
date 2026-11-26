from pathlib import Path
r=Path(__file__).parent
p=r/'template.html';s=p.read_text(encoding='utf-8').replace('否（按本层优化最少点）','否（本层井字网格减量）');p.write_text(s,encoding='utf-8')
p=r/'app.js';s=p.read_text(encoding='utf-8').replace('重合区开启时保留参考方案的对应连接坐标，关闭时两层各自优化','重合区开启时共同计算楼面轴线并检查对应连接，关闭时两层各自计算井字网格').replace('本层独立区；弧梁','本层独立区；楼面另检查井字形的横纵连通和闭合单元，弧梁').replace('不对齐 / 优化点数','不对齐 / 井字减量');p.write_text(s,encoding='utf-8')
p=r/'v5-controls.js';s=p.read_text(encoding='utf-8').replace('<b>单楼面井字形 ${p.summary.gridPass??0} / ${p.summary.gridFloors??p.slabs.length} 块通过</b>','<b>${DATA.meta.manualModified?\'人工修改后井字形待重新校核\':\'单楼面井字形 \'+(p.summary.gridPass??0)+\' / \'+(p.summary.gridFloors??p.slabs.length)+\' 块通过\'}</b>');p.write_text(s,encoding='utf-8')
p=r/'floor-grid-ui.js';s=p.read_text(encoding='utf-8').replace('const g=s.grid;if(!g)return \'<p>尚无井字形校核记录</p>\';','const g=s.grid;if(!g)return \'<p>尚无井字形校核记录</p>\';if(DATA.meta.manualModified)return \'<p>人工修改了支撑中心；当前楼面井字形、间距与连接需要重新校核。</p>\';');p.write_text(s,encoding='utf-8')
