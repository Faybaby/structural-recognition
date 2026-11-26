import fs from 'node:fs';import assert from 'node:assert/strict';
import {calculateOrdinaryBeams} from '../../stage1/ordinary-core.js';
import {calculateOrdinaryLandings} from '../../stage1/ordinary-landing-core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8')),input=read('ordinary-input'),data=read('data'),settings={global:{origin:[8600,4100],angleDeg:0},locals:{},revision:1};
const before=JSON.stringify(input),out=calculateOrdinaryBeams(input,settings);assert.equal(JSON.stringify(input),before);assert.equal(out.rules.intersectionModulusConflict,'allow-true-junction-flag-no-displacement');
const j=out.junctions.find(j=>j.key==='even'&&j.point[0]===4825&&j.point[1]===8200);assert(j);assert.equal(j.status,'placed');assert(j.modulusException);assert.equal(j.modulusReview.maxDeviation,25);assert(j.modulusReview.axes.some(a=>!a.onGrid));
const point=out.points.filter(n=>n.key==='even'&&n.world[0]===4825&&n.world[1]===8200);assert.equal(point.length,1);assert(point[0].junctionModulusException);assert.equal(point[0].origin,'梁梁交点');
for(const id of j.beamIds){const b=out.beams.find(b=>b.id===id);assert.equal(b.status,'passed');const n=b.nodes.find(n=>n.id===point[0].id);assert(n);assert(n.junctionModulusException);assert.equal(n.modulusReview.maxDeviation,25);}
assert.deepEqual(out.beams.find(b=>b.id==='even/PB012/C02/JG1').segments.map(s=>s.gtt),[425,1075]);
for(const b of out.beams)for(const n of b.nodes){if(n.junctionModulusException){assert.equal(n.origin,'梁梁交点');assert(b.junctions.some(j=>j.modulusException&&Math.hypot(...j.point.map((x,i)=>x-n.world[i]))<.01));}else if(!n.modulusException)assert(Math.abs(n.axisCoordinate/50-Math.round(n.axisCoordinate/50))<1e-6,b.id);}
for(const j of out.junctions){if(j.heightDifference>=100-1e-5||j.exemptParticipants.length){assert.equal(j.status,'excluded');assert(!j.modulusException);}if(j.modulusException){assert.equal(j.status,'placed');assert(j.modulusReview.axes.every(a=>Math.abs(a.coordinate-a.nearestGridCoordinate-a.deviation)<1e-6));}}
assert.equal(out.beams.find(b=>b.id==='even/PB003/CAD-D01').status,'passed');assert(out.beams.filter(b=>b.status==='pending').every(b=>!b.reasons.some(s=>s.includes('交点50mm模数冲突'))));
// Several pairs at one physical junction still create one point; a later
// off-grid pair upgrades all earlier references instead of losing its flag.
const region=[{polygon:[[-100,-1600],[3100,-1600],[3100,1600],[-100,1600]],holes:[]}];
const beam=(id,start,end,height=300)=>{const length=Math.hypot(end[0]-start[0],end[1]-start[1]);return {id,key:'test',memberIds:[id],width:200,gw:200,height,thickness:100,sourceFace:id,bottom:3000-height,region,start,end,length,path:{type:'line',start,end,length,gw:200},ends:[{type:'yin'},{type:'yin'}],issues:[]};};
const fixture={storyHeight:3000,source:{},rules:{},coverage:[],index:[{width:200,height:300,thickness:100,storyHeight:3000,spacing:1200}],beams:[beam('A',[0,0],[3000,0]),beam('B',[1525,-1500],[1525,1500]),beam('C',[1525,-1200],[1525,1200])]};
const many=calculateOrdinaryBeams(fixture,{global:{origin:[0,0],angleDeg:0},locals:{},revision:1});assert.equal(many.points.filter(n=>n.origin==='梁梁交点').length,1);assert.equal(many.junctions.length,2);assert(many.beams.every(b=>b.nodes.find(n=>n.origin==='梁梁交点')?.junctionModulusException));
out.landings=calculateOrdinaryLandings({floors:out.landingFloors},data,read('landing-input'));
fs.writeFileSync(new URL('../../../../outputs/普通梁支撑_含承接长度.json',import.meta.url),JSON.stringify({...out,settings},null,2));
const report={passed:true,summary:out.summary,landings:out.landings.summary,pb012:{junction:j,point:point[0],gtt:[425,1075]},otherSpanPointsKeep50mm:true,exceptionRecords:out.junctions.filter(j=>j.modulusException).length,exceptionUniquePoints:out.points.filter(n=>n.junctionModulusException).length};
fs.writeFileSync(new URL('./junction-modulus-exception-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
