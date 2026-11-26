from pathlib import Path
r=Path(__file__).parent
p=r/'template.html';s=p.read_text(encoding='utf-8')
s=s.replace('橙 / 紫分层计量，重合处仍需对应连接','橙 / 紫分层计量，连接要求随对齐选项切换')
s=s.replace('<span id="alignmentDescription">仅重合区域要求对应连接</span>','<span id="alignmentDescription">重合区、非重合区分别选择对齐</span>')
s=s.replace('<span id="baselineStatus">','<button class="button" id="baselineMark">推荐基准点回标</button><span id="baselineStatus">')
p.write_text(s,encoding='utf-8')
p=r/'app.js';s=p.read_text(encoding='utf-8')
s=s.replace('仅两层几何重合区域必须对应连接，包含同参数公共区和参数变化的重合区。不重合区域默认独立，可选择尽量延续重合区网格；切换选项不会改变重合区必需对位坐标。','两层几何重合区与非重合区分别选择是否对齐。重合区开启时保留参考方案的对应连接坐标，关闭时两层各自优化；非重合区默认独立，也可选择延续参考网格。所有数量按层分别计量。')
s=s.replace("$('baselineEven').onclick=()=>sendBaseline('even');","$('baselineEven').onclick=()=>sendBaseline('even');$('baselineMark').onclick=()=>{if(!baselineReady){toast('基准点工具正在初始化');return;}$('baselineFrame').contentWindow.postMessage({type:'gd:request-baseline-point'},location.origin==='null'?'*':location.origin);};")
s=s.replace("summary:'公共区域生成成对的同坐标支撑。两层的实体、型号和数量均保留；“一对”不是把两根支撑合成一根。'","summary:()=>DATA.meta.alignOverlap?'重合区开启对齐，生成同坐标支撑并检查对应连接。各层实体、型号和数量分别保留。':'重合区关闭对齐，两层各自优化；不要求同坐标配对。各层实体、型号和数量分别保留。'")
s=s.replace('同参数的公共区和参数变化的重合区，均检查支撑是否能够对应连接。','重合区开启对齐时，同参数公共区和参数变化区均检查对应连接；关闭时按各层约束独立优化。')
s=s.replace('变化区：位置重叠但参数不同，两层分别计算并检查对应连接。','变化区：位置重叠但参数不同，两层分别计算；开启重合区对齐时检查对应连接。')
p.write_text(s,encoding='utf-8')
