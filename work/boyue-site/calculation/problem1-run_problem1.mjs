import fs from 'node:fs';
import {calculate} from '../boyue-site/model3d/calculate.js';
const data=JSON.parse(fs.readFileSync('work/boyue-site/model3d-input.json','utf8'));
const start=Date.now(),r=calculate(data);fs.writeFileSync('work/boyue-site/model3d-data.json',JSON.stringify(r));console.log(JSON.stringify({ms:Date.now()-start,blocked:r.blocked,pairs:r.pairedCoordinates,plans:r.plans.map(p=>({key:p.key,nodes:p.nodes.length,rods:p.links.length,issues:p.issues.length,arcs:p.beamGroups.filter(g=>g.axis.type==='arc').length,gl:p.beamGroups.filter(g=>g.gl.length).length}))}));
