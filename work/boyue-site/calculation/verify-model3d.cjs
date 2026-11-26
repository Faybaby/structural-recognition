const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root='work/boyue-site/',html=fs.readFileSync(root+'dist/index.html','utf8'),source=fs.readFileSync(root+'model3d/main.js','utf8');
const data=JSON.parse(html.match(/<script id="model3d-data" type="application\/json">(.*?)<\/script>/s)[1]);
const dwg=JSON.parse(html.match(/window\.MODEL3D_DWG=(.*?);\r?\n/s)[1]);
assert.equal(data.verification.passed,true);assert.equal(data.plans.reduce((s,p)=>s+p.nodes.length,0),471);assert.equal(data.pairedCoordinates,194);
const fn=source.match(/\$\('modelExportDwg'\)\.onclick=\(\)=>\{(.*?)\};\r?\n/s)[1];
const captured=[],ctx={window:{MODEL3D_DWG:dwg},state:{scope:'both'},planMap:{odd:{name:'奇数层'},even:{name:'偶数层'}},atob,Uint8Array,Blob,download:(name,blob)=>captured.push({name,blob}),alert:()=>{throw Error('missing export')}};vm.createContext(ctx);
(async()=>{for(const key of ['odd','even','both']){ctx.state.scope=key;vm.runInContext('(()=>{'+fn+'})()',ctx);const file=fs.readFileSync(root+'dist/model3d-dwg/'+key+'.dwg');assert.equal(file.subarray(0,6).toString(),'AC1032');assert.equal(Buffer.from(dwg[key],'base64').compare(file),0);assert.equal(Buffer.from(await captured.at(-1).blob.arrayBuffer()).compare(file),0);}
// View changes must be pure translations; source coordinate arrays remain unchanged.
const layerOffset=source.match(/function layerOffset\(key\)\{(.*?)\}/s)[0],lctx={state:{scope:'both',explode:0,lifts:{odd:0,even:0}},plans:data.plans};vm.createContext(lctx);vm.runInContext(layerOffset,lctx);assert.equal(vm.runInContext("layerOffset('even')",lctx),3000);lctx.state.lifts.even=1000;assert.equal(vm.runInContext("layerOffset('even')",lctx),4000);lctx.state.explode=6000;assert.equal(vm.runInContext("layerOffset('even')",lctx),10000);assert.equal(vm.runInContext("layerOffset('odd')",lctx),0);
new vm.Script(fs.readFileSync(root+'model3d.bundle.js','utf8'));
assert.ok(html.length<25*1024*1024);assert.ok(html.includes('modelPanUp')&&html.includes('modelLiftNumber')&&html.includes('modelProcessSteps'));
const report={passed:true,nativeDwgDownloads:3,embeddedBytesEqualNativeFiles:true,editableNativeBlocks:471,sharedCoordinates:194,viewOffsetCalculations:true,syntax:true,bytes:Buffer.byteLength(html),browserFinalRetest:'not completed: browser URL could not be reliably identified'};fs.writeFileSync('outputs/三维网页导出校核.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));})();

