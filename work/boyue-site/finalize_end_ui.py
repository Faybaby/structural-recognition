from pathlib import Path
R=Path(__file__).parent
p=R/'app.js';s=p.read_text(encoding='utf-8')
s=s.replace("'连接方向数','索引来源'];data=rows().map(n=>", "'横杆连接数','索引来源','属于重合连接范围','重合对应号','梁端支撑','中心线里程mm'];data=rows().map(n=>")
s=s.replace("n.source,n.owner,n.degree,n.cell];", "n.source,n.owner,n.degree,n.cell,n.requiredAlignment?'是':'否',n.alignmentPairId||'',n.terminal?'是':'否',n.station??''];")
s=s.replace("${state.overlay?'两层重叠计算':p.name}</strong><br><span", "${state.overlay?'两层重叠计算':p.name}</strong><br><span>非重合区：${DATA.meta.alignNonOverlap?'延续对齐':'独立布置'}</span><br><span>重合区已对应 ${DATA.overlay.pairedOverlapNodes} 对</span><br><span")
s=s.replace("download(`铂悦府6号_${plan().name}_步骤", "download(`铂悦府6号_${state.alignmentMode==='aligned'?'不重合区对齐':'不重合区独立'}_${plan().name}_步骤")
s=s.replace('两层梁板类型、截面/板厚及相对标高一致，蓝色对位。','两层梁板类型、截面/板厚及相对标高一致，且梁轴线可对应，蓝色对位。')
p.write_text(s,encoding='utf-8')
p=R/'template.html';s=p.read_text(encoding='utf-8').replace('<span><i style="border:1px solid #087d70;', '<span>虚线：重合连接范围</span><span><i style="border:1px solid #087d70;')
p.write_text(s,encoding='utf-8')
