from pathlib import Path
p=Path(__file__).parent/'v5-controls.js';s=p.read_text(encoding='utf-8')
s=s.replace("state.plan+'-HR'","state.plan+'-MANUAL-HR'")
s=s.replace("if(p.walls.some(w=>isInside(at,w.polygon))", "if((p.openings||[]).some(o=>isInside(at,o.polygon)||Math.min(...o.polygon.map((a,i)=>segmentProjection(at,a,o.polygon[(i+1)%o.polygon.length]).distance))<150-1e-6))return null;\n if(p.walls.some(w=>isInside(at,w.polygon))")
s=s.replace("mateHit=placementAt(other,at),required=", "mateRaw=placementAt(other,at),mateHit=mateRaw?.kind==='梁'?mateRaw:null,required=")
s=s.replace("function applyLockedRectangles(){for(const r of state.lockedRects||[])addLockedRect(r);}","function applyLockedRectangles(){for(const r of state.lockedRects||[]){if(!r.id.includes('MANUAL'))r.id='MANUAL-'+r.id;addLockedRect(r);}}")
s=s.replace('未匹配可计算梁轴线或矩形宽度与梁宽不一致。','未匹配可计算梁轴线、矩形宽度与梁宽不一致，或中心进入洞口150mm避让范围。')
p.write_text(s,encoding='utf-8')
