from pathlib import Path
p=Path(__file__).parent/'floor-grid-ui.js'
s=p.read_text(encoding='utf-8')
s=s.replace("(all?'非重合区同时延续参考网格。':'')","(all?'非重合区延续参考轴网：X=450+'+Math.min(s.limitX,900)+'k，Y=450+'+Math.min(s.limitY,900)+'k（mm，k为整数）；间距不超过本层上限，异形边界另补排。':'')")
p.write_text(s,encoding='utf-8')
