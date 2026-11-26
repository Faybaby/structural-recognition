from pathlib import Path
p=Path(__file__).parent/'template.html'
s=p.read_text(encoding='utf-8')
s=s.replace('<select id="floorGridSelect"','<select id="floorCompareScope" aria-label="井字计算对比范围"><option value="all">对比：均不对齐 / 均对齐</option><option value="overlap">只对比重合区（沿用顶部非重合选项）</option></select><select id="floorGridSelect"')
p.write_text(s,encoding='utf-8')
