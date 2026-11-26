import {toBaseline} from './baseline-core.js';
export const UNIFORM_COLORS={floor:0x14b8c4,beam:0x8b5cf6};
export function findUniformAudit(result,{kind,owner,key,regionId,layer}){
 if(!result?.config.uniform||!layer||layer==='all')return null;
 return result.uniformAudit.find(a=>a.layer===layer&&(!kind||a.kind===kind)&&(!key||a.key===key)&&(owner?a.id===owner:(result.aligned[a.kind][a.kind==='floor'?'floors':'beams'].find(r=>r.id===a.id&&r.layer===layer)?.memberIds||[]).includes(regionId)))||null;
}
export function uniformDiagram(a,result){
 const row=result.aligned[a.kind][a.kind==='floor'?'floors':'beams'].find(r=>r.id===a.id&&r.layer===a.layer),base=result.uniformBase;
 const pts=a.afterPoints.map(p=>({...p,q:toBaseline(p.world,base)})),rings=(row?.region||[]).flatMap(r=>[r.polygon,...(r.holes||[])]).map(r=>r.map(p=>toBaseline(p,base))),all=[...pts.map(p=>p.q),...rings.flat()];
 if(!all.length)return '<li><b>当前调整结果</b><p>未生成可用点位，待核对。</p></li>';
 const x=Math.min(...all.map(p=>p[0])),y=Math.min(...all.map(p=>p[1])),w=Math.max(1,Math.max(...all.map(p=>p[0]))-x),h=Math.max(1,Math.max(...all.map(p=>p[1]))-y),scale=Math.min(460/w,290/h),at=p=>[65+(p[0]-x)*scale,80+(y+h-p[1])*scale],color=a.kind==='floor'?'#087e88':'#7045c5';
 const gaps=[];for(const axis of [0,1]){const groups=new Map();for(const p of pts){const k=Math.round(p.q[1-axis]*20);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p);}for(const group of groups.values()){group.sort((a,b)=>a.q[axis]-b.q[axis]);for(let i=1;i<group.length;i++){const p=group[i-1],q=group[i],d=q.q[axis]-p.q[axis];if(d>.05)gaps.push({p,q,d,axis});}}}
 const number=n=>Number(n.toFixed(2)).toLocaleString('zh-CN');
 const shapes=rings.map(r=>'<polygon points="'+r.map(p=>at(p).join(',')).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="1.5"/>').join('');
 const lines=gaps.map(g=>{const p=at(g.p.q),q=at(g.q.q),full=Math.abs(g.d-a.pitch)<.05;return '<line x1="'+p[0]+'" y1="'+p[1]+'" x2="'+q[0]+'" y2="'+q[1]+'" stroke="'+color+'" stroke-opacity=".45" stroke-dasharray="3 3"/><text x="'+((p[0]+q[0])/2+(g.axis?8:0))+'" y="'+((p[1]+q[1])/2-(g.axis?0:8))+'" font-size="11" fill="'+(full?color:'#ac5630')+'">'+number(g.d)+(full?'':'*')+'</text>';}).join('');
 return '<li class="uniform-diagram"><b>当前对齐布置：'+a.pitch+'mm</b><p>以下点距来自本层新坐标；原表间距仅列在下方作对照。</p><svg viewBox="0 0 600 420" role="img" aria-label="对齐后实际点位及间距"><text x="25" y="26" fill="'+color+'" font-size="17">'+a.layer+' · S＝'+a.pitch+'mm · 已调整</text>'+shapes+lines+pts.map(p=>{const q=at(p.q);return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="4" fill="'+(p.status==='found'?color:'#d95759')+'"/>';}).join('')+'<text x="20" y="405" font-size="12" fill="#626e68">尺寸单位mm；*为实际边界／洞周例外点距，连线仅作尺寸示意</text></svg></li>';
}
