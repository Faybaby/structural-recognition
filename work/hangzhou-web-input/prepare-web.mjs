import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewNativeFaces, nativePayload} from '../../outputs/SW支撑布置插件_正式首版/src/engine/native-adapter.js';
import {alignCadReference, matchCadReference} from '../../outputs/SW支撑布置插件_正式首版/src/engine/cad-reference.js';

const input = new URL('./', import.meta.url);
const source = new URL('../boyue-site/stage1/', input);
const output = new URL('projects/hangzhou/', source);
const read = (name, root = input) => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
const write = (name, value) => fs.writeFileSync(new URL(name, output), JSON.stringify(value));
const digest = name => createHash('sha256').update(fs.readFileSync(new URL(name, input))).digest('hex');
const stepFile = '5#楼（4层墙）基本层三维模型2026.8.15.STEP';
const drawingFile = '杭政储出[2024]32号地块项目-04地块5#楼铝模深化底图2026.08.11_t3.dwg';
const modelSha256 = digest('hangzhou-4.step'), drawingSha256 = digest('hangzhou-input.dwg');
const scan = read('native.json');
const mesh = read('mesh.json');
const cad = read('cad.json');
const key = 'hangzhou-4', storyHeight = 4200;

const candidates = scan.faces.filter(face => face.direction === 'up' ||
 (face.area > 40000 && !(!face.sloped && Math.abs(face.height) <= .1)));
const alignment = alignCadReference(candidates, cad);
if (!alignment.alignment) throw Error(alignment.reason);
const {matches, mapped} = matchCadReference(candidates, cad, alignment.alignment);
const cadFaces = new Map(matches.map(row => [row.faceId, row.labels]));
const reviewed = reviewNativeFaces({...scan, faces:candidates}, {storyHeight});
const pendingFaces = new Map();
for (const face of reviewed) {
 if (face.direction !== 'down') continue;
 const labels = cadFaces.get(face.id) || [];
 const has = kind => labels.some(l => l.label === kind);
 if (face.sloped) pendingFaces.set(face.id, '斜底面保留真实坡度，楼梯阳线或梁段分类待核对');
 else if (face.kind !== 'floor' && has('楼面')) pendingFaces.set(face.id, '底图覆盖楼面，STEP 尚未找到对应板顶与板厚，先按楼面候选核对');
 else if (face.kind === 'ordinary' && !face.beamHeight) pendingFaces.set(face.id, 'STEP 未能确认可用于查表的梁高');
 else if (face.kind === 'ordinary' && !face.autoRoutes.length && !has('梁')) pendingFaces.set(face.id, '尚未得到可靠梁轴或二维梁依据，类别待核对');
}
const priorFloor = read('floor-input.json', source), priorBeam = read('beam-input.json', source);
const floorSource = {...priorFloor.source};
const beamSource = {...priorBeam.source, sheet:null, availableSheets:[...new Set(priorBeam.index.map(row => row.storyHeight))].sort((a,b) => a-b)};
const active = reviewed.filter(face => !pendingFaces.has(face.id));
const result = nativePayload({...scan, faces:active}, {storyHeight, origin:[0,0], angleDeg:0}, {
 floor:{source:floorSource,index:priorFloor.index},
 beam:{source:beamSource,index:priorBeam.index},
});
const {floorInput, beamInput, ordinaryInput} = result;
for (const row of [...floorInput.floors, ...beamInput.beams, ...ordinaryInput.beams, ...ordinaryInput.groups, ...ordinaryInput.sources]) row.key = key;
for (const b of [...beamInput.beams, ...ordinaryInput.beams]) b.layer = 'L1';
const regionOf = f => [{polygon:f.polygon, holes:f.holes}];
const featureBySource = new Map(mapped.map(feature => [feature.source, feature]));
const kindOf = f => f.kind === 'floor' ? 'slab' : f.kind === 'gl' ? 'gl' : 'beam';
function makeZone(f) {
 const labels = cadFaces.get(f.id) || [];
 const sources = [...new Set(labels.flatMap(label => label.sources))].map(source => ({source,layer:featureBySource.get(source)?.layer,category:featureBySource.get(source)?.category}));
 const region = regionOf(f);
 const depth = f.kind === 'floor' ? f.thickness : f.beamHeight;
 const pending = pendingFaces.get(f.id);
 return {
  id:f.id, kind:pending ? 'unmatched' : kindOf(f), face:f.id,
  region, commonRegion:region, exclusiveRegion:[], area:f.area / 1e6,
  bottom:f.height, top:depth > 0 ? f.height + depth : null, geometricDepth:depth || null,
  planeNormal:f.planeNormal, planeOrigin:f.planeOrigin, hasArc:f.hasCurves,
  sources, labels:[], evidence:f.parameterEvidence || f.reason, status:pending ? '待核对' : '三维识别',
  notes:pending ? [pending] : [], participatesInCalculation:!pending,
 };
}
const zones = active.filter(f => f.direction === 'down').map(makeZone);
const unmatched = reviewed.filter(f => pendingFaces.has(f.id)).map(makeZone);
const byZone = new Map([...zones,...unmatched].map(zone => [zone.id,zone]));
for (const group of ordinaryInput.groups) {
 const zone = byZone.get(group.id);
 group.bottom = zone.bottom;
 group.area = zone.area;
 group.height = zone.geometricDepth;
 group.memberIds = [zone.id];
 group.levels = [zone.bottom];
 group.merges = [];
}
ordinaryInput.coverage = result.pending.filter(item => byZone.get(item.id.split('/边界')[0])?.kind === 'beam').map(item => {
 const z = byZone.get(item.id.split('/边界')[0]);
 return {...item,key,status:'pending',region:z.region,memberIds:[z.id],bottom:z.bottom};
});
ordinaryInput.rebateEvidence = {file:{path:drawingFile},status:'reference-only',features:[]};
ordinaryInput.rules = {geometry:'STEP 实体优先，DWG 提供投影重合依据'};
beamInput.rules = ordinaryInput.rules;
floorInput.rules = ordinaryInput.rules;
const facesById = new Map(active.map(face => [face.id,face]));
const edgeEvidence = {groups:ordinaryInput.groups.map(group => ({
 id:group.id,
 boundaryEdges:facesById.get(group.id).edges.map((edge,i) => {
  const points = edge.curvePoints?.length > 1 ? edge.curvePoints : [edge.start,edge.end];
  const length = points.slice(1).reduce((total,p,j) => total + Math.hypot(p[0]-points[j][0],p[1]-points[j][1]),0);
  return {id:'E'+(i+1),start:edge.start,end:edge.end,points,length,
   at:points[Math.floor(points.length/2)],type:'pending',reason:edge.reason,outer:edge.outer};
 }),
}))};
const drawingBounds = [mesh.box[0], -mesh.box[5], mesh.box[3], -mesh.box[2]];
const drawingEvidence = mapped.filter(({bounds:b}) => b[0]>=drawingBounds[0]-1500 && b[2]<=drawingBounds[2]+1500 && b[1]>=drawingBounds[1]-1500 && b[3]<=drawingBounds[3]+1500)
 .map(({source,layer,category,region}) => ({source,layer,category,region}));
const supportingFaces = reviewed.filter(f => f.direction === 'up' && f.triangles.length)
 .map(f => ({id:f.id,triangles:f.triangles,planeNormal:f.planeNormal,planeOrigin:f.planeOrigin,region:regionOf(f)}));
const landingInput = {source:stepFile,plans:{[key]:{faces:supportingFaces}}};
const label = '第4层基本模型';
const data = {
 stage:1, title:'杭州5号楼 · 支撑布置', projectName:'杭州5号楼', storyHeight,
 sequence:[label], drawingFile, drawingSha256,
 inputs:[{path:stepFile,sha256:modelSha256},{path:drawingFile,sha256:drawingSha256}],
 cadRegistration:{...alignment, projectedFaceMatches:matches.length, plotFeatures:drawingEvidence.length},
 instances:[{id:'L1',key,label,order:1,offset:0,wallType:'杭州5号楼',floorType:label,displayMainLevel:storyHeight}],
 plans:[{key,file:stepFile,sha256:modelSha256,wallType:'杭州5号楼',floorType:label,drawingOffsetX:alignment.alignment.x,
  base:0,level:storyHeight,modelStory:storyHeight,sourceBox:mesh.box,
  meshes:[{id:'hz-4',name:label,vertexCount:mesh.vertices,positions:mesh.positions}],
  zones,unmatched,twoDReview:[],excluded:[],specialZones:[],drawingEvidence,drawingLabels:[],drawingTitles:[],
 }],
};
write('data.json', data);
write('floor-input.json', {...floorInput,floors:[]});
write('beam-input.json', beamInput);
write('ordinary-input.json', ordinaryInput);
write('partition-input.json', {rule:'杭州第4层 STEP 分面',zoneOverrides:{},extraZones:[],floors:floorInput.floors});
write('landing-input.json', landingInput);
write('review-proposals.json', {rows:[],summary:{total:0,candidate:0,protectedWidth:0,review:0}});
write('ordinary-edge-input.json', edgeEvidence);
write('cad-review-input.json', {file:drawingFile,rules:[]});
console.log(JSON.stringify({alignment,floors:floorInput.floors.length,beams:ordinaryInput.groups.length,routes:ordinaryInput.beams.length,
  unmatched:unmatched.length,drawingEvidence:drawingEvidence.length,triangles:mesh.vertices/3,receivers:supportingFaces.length,
  floorMaxHeight:Math.max(...floorInput.index.map(row=>row.storyHeight)),beamSheets:beamInput.source.availableSheets}));
