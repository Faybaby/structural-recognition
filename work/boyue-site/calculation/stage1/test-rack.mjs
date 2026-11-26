import fs from 'node:fs';import assert from 'node:assert/strict';
import {calculateRack} from '../../stage1/rack-core.js';
import {segmentTriangleDistanceSquared,createRackGeometry} from '../../stage1/rack-geometry.js';
import {alignVerticalBeams} from '../../stage1/rack-vertical.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../../stage1/'+n+'.json',import.meta.url),'utf8'));
const rect=(x,y,w,h)=>[{polygon:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],holes:[]}];
const empty=()=>({beams:[],landings:{points:[]},summary:{}});
const data={instances:[{id:'L1',key:'even',order:1,offset:0}],plans:[{key:'even',base:0,zones:[],meshes:[]}]},landingInput={plans:{even:{faces:[]}}},settings={global:{origin:[0,0],angleDeg:0},locals:{},revision:1};
function sample(height=4000){const nodes=[[0,0],[900,0],[0,900],[900,900]].map((world,i)=>({id:'P'+i,world,sourceHeight:height,sourceFace:'face',origin:'普通点'})),floor={floors:[{id:'F',key:'even',nodes}],summary:{},landings:{points:nodes.map(n=>({id:'L1/'+n.id,nodeId:n.id,floorId:'F',layer:'L1',world:n.world,startHeight:height,length:height,status:'found',landing:{height:0,layer:'L1',order:1},checks:[],skippedLayers:[]}))}};return {floor,gl:empty(),ordinary:{...empty(),points:[],landingFloors:[]}};}
const input={data,landingInput,settings,floorInput:{overlapGroups:[],floors:[]},options:{alignLeap:false}};
const square=calculateRack({...input,sources:sample()});assert.equal(square.rods.length,12);assert.equal(square.cells.length,3);assert.equal(square.summary.formed,4);assert.equal(square.summary.addedPoles,0);
const threshold=calculateRack({...input,sources:sample(3200)});assert.equal(threshold.summary.high,0);assert.equal(threshold.rods.length,0);
assert.equal(segmentTriangleDistanceSquared([0,0,0],[100,0,0],[[50,-10,-10],[50,10,-10],[50,0,10]]),0);
assert.ok(Math.abs(segmentTriangleDistanceSquared([0,0,20],[100,0,20],[[50,-10,0],[50,10,0],[50,0,0]])-400)<1e-6);
const line=(id,key,ts)=>({id,key,status:'passed',path:{type:'line',start:[0,0],end:[3000,0],length:3000},length:3000,region:rect(-1,-100,3002,200),bottom:2600,segments:[],nodes:ts.map((x,i)=>({id:id+i,world:[x,0]}))});
const aa=line('a','even',[500,1500,2500]),bb=line('b','odd',[600,1600,2600]);const joint=alignVerticalBeams({beams:[aa,bb]},b=>b.id==='b'?[{...b,nodes:b.nodes.map((n,i)=>({...n,world:[500+i*1000,0]}))}]:[]);assert.equal(joint.audits[0].status,'aligned');
const conflict=alignVerticalBeams({beams:[aa,bb]},()=>[]);assert.equal(conflict.audits[0].status,'pending');

console.log('PASS closed900cells, strict3200threshold, capsule distance, compatible and conflicting vertical beam cases');
