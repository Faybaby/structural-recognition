import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {layoutBeamSpan,calculateBeams} from '../../stage1/beam-core.js';
import {calculateLandings} from '../../stage1/landing-core.js';
const site=new URL('../../',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL('stage1/'+n,site),'utf8'));
const oldText=execFileSync('git',['show','d8fa5e6ea76255b2f3993a5c68fd67c8e6621e93:stage1/beam-core.js'],{cwd:fileURLToPath(site),encoding:'utf8'}).replace("'./floor-core.js'",JSON.stringify(new URL('stage1/floor-core.js',site).href));
const previous=await import('data:text/javascript;base64,'+Buffer.from(oldText).toString('base64'));
const ends=[{type:'yang'},{type:'yang'}];
for(const gw of [150.001,151,200,300]){
 const r=layoutBeamSpan({length:800,gw,ends,spacing:1200});
 assert.equal(r.status,'passed');assert.deepEqual(r.endOffsets,[50,50]);assert.equal(r.gtt,700);
}
for(const gw of [100,150])assert.deepEqual(layoutBeamSpan({length:800,gw,ends,spacing:1200}).endOffsets,[100,100]);
const shifted=layoutBeamSpan({length:800,gw:200,ends,spacing:1200,originProjection:25});
assert.deepEqual(shifted.endOffsets,[75,75]);assert(shifted.nodes.every(n=>(n.t+25)%50===0));
const boundary=layoutBeamSpan({length:800,gw:200,ends:[{type:'yang'},{type:'yin'}],spacing:1200,originProjection:20});assert.equal(boundary.endOffsets[0],80);
const invalid=layoutBeamSpan({length:800,gw:200,ends,spacing:1200,originProjection:10});
assert.equal(invalid.status,'pending');assert.equal(invalid.nodes.length,0);assert.match(invalid.reasons[0],/50～80/);
const input=read('beam-input.json'),data=read('data.json'),settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1};
const old=previous.calculateBeams(input,settings),now=calculateBeams(input,settings),changed=[];
assert.deepEqual(now.summary,old.summary);
for(let i=0;i<now.beams.length;i++){
 const b=now.beams[i],p=old.beams[i];
 if(b.gw<=150||b.ends.every(e=>e.type==='yin'))assert.deepEqual(b,p);
 else {changed.push(b.id);assert(b.nodes.filter(n=>n.origin==='阳线端部').every(n=>n.gll===50));}
 assert.deepEqual(b.region,p.region);assert.equal(b.index.spacing,p.index.spacing);
}
now.landings=calculateLandings({floors:now.beams},data,read('landing-input.json'));
const oldLandings=calculateLandings({floors:old.beams},data,read('landing-input.json'));
const moved=now.landings.points.filter((p,i)=>JSON.stringify(p.world)!==JSON.stringify(oldLandings.points[i].world)).length;
assert.equal(changed.length,4);assert.equal(moved,12);
const report={passed:true,range:[50,80],preferred:50,equal150:'previous range 100..130',changedBeams:changed,movedFourLayerPoints:moved,summary:now.summary,landings:now.landings.summary,checks:['both yang ends choose50','range upper80 inclusive','no valid modulus remains pending','GW1=150 unchanged','all smaller-width and double-yin beam results unchanged','geometry/index/spacing unchanged','landings recomputed for moved positions']};
fs.writeFileSync(new URL('./gll-range-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
