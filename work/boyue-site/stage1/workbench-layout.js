// Move live controls without cloning them, preserving their state and handlers.
export function createWorkbenchLayout(projectTitle){
 const main=document.querySelector('main'),workspace=document.querySelector('.workspace'),viewer=document.getElementById('viewer');
 const bar=document.createElement('nav');bar.className='workbench-menu';bar.setAttribute('aria-label','项目与计算菜单');
 const title=document.createElement('b');title.className='workbench-title';title.textContent=projectTitle;bar.append(title);
 function menu(label,id){const details=document.createElement('details');details.className='workbench-dropdown';details.id=id;const summary=document.createElement('summary');summary.textContent=label;const body=document.createElement('div');body.className='workbench-dropdown-body';details.append(summary,body);bar.append(details);details.addEventListener('toggle',()=>{if(details.open)for(const other of bar.querySelectorAll(':scope > details'))if(other!==details)other.open=false;});return body;}
 function fold(parent,node,label){if(!node)return;if(node.classList.contains('floor-calculation'))node.hidden=false;const details=document.createElement('details');details.className='workbench-section';const summary=document.createElement('summary');summary.textContent=label;details.append(summary,node);parent.append(details);}
 const setup=menu('输入与基准','projectMenu'),display=menu('显示开关','displayMenu'),calculations=menu('计算、表格与导出','calculationMenu');
 fold(setup,main.querySelector('header'),'项目说明');fold(setup,main.querySelector('.input-card'),'输入文件与识别导出');fold(setup,document.getElementById('baselineWorkflow'),'基准点设置／修改');
 const resultSwitches=main.querySelector('.result-switches');if(resultSwitches)display.append(resultSwitches);
 const markers=document.getElementById('markerToggles');if(markers)display.append(markers);
 for(const note of [...viewer.children].filter(n=>n.matches('p.note')))fold(display,note,'视图说明与定位');
 for(const node of [...main.children]){if(node===workspace||node===bar)continue;fold(calculations,node,node.querySelector('h2')?.textContent?.trim()||(node.matches('footer')?'离线页面下载':'其他资料'));}
 main.prepend(bar);main.classList.add('compact-workbench');
 bar.addEventListener('click',e=>{if(e.target.closest('tbody tr,[data-rack-point],#bpLocate,#bpPick3d,#edgeBeams,#stairYangline,#showCrossLayer,#rackLocateHigh'))for(const d of bar.querySelectorAll(':scope > details'))d.open=false;});
 document.addEventListener('pointerdown',e=>{if(!bar.contains(e.target))for(const d of bar.querySelectorAll(':scope > details'))d.open=false;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const d of bar.querySelectorAll(':scope > details'))d.open=false;});
}
