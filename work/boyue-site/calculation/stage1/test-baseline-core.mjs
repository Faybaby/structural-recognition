import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SCHEMA,toBaseline,fromBaseline,geometryKey,validateSettings,effectiveBaseline,normalizeAngle} from '../../stage1/baseline-core.js';
const data=JSON.parse(fs.readFileSync(new URL('../../stage1/data.json',import.meta.url),'utf8'));
const key=geometryKey(data),floorId='even/even-R001',floors=new Set([floorId]);
for(const angle of [0,90,-30,180,37.25]){
 const base={origin:[1234.5,-678.9],angleDeg:angle};
 const point=fromBaseline([350,-125],base),local=toBaseline(point,base);
 assert(Math.abs(local[0]-350)<1e-9&&Math.abs(local[1]+125)<1e-9);
 assert(toBaseline(base.origin,base).every(x=>x===0));
}
assert.equal(normalizeAngle(450),90);
const config={schema:SCHEMA,geometryKey:key,revision:1,updatedAt:new Date().toISOString(),global:{origin:[1000,2000],angleDeg:0},locals:{}};
assert.equal(effectiveBaseline(config,floorId),config.global);
config.locals[floorId]={origin:[1050,2050],angleDeg:90};
config.global={origin:[3000,4000],angleDeg:30};
assert.deepEqual(effectiveBaseline(config,floorId),{origin:[1050,2050],angleDeg:90});
const imported=validateSettings(JSON.parse(JSON.stringify(config)),key,floors);assert.deepEqual(imported,config);
assert.throws(()=>validateSettings({...config,geometryKey:'another-model'},key,floors),/其他模型/);
assert.throws(()=>validateSettings({...config,locals:{'even/unknown':config.global}},key,floors),/不存在/);
assert.throws(()=>validateSettings({...config,global:{origin:[null,0],angleDeg:0}},key,floors),/无效/);
assert.throws(()=>validateSettings({...config,global:null},key,floors),/缺少整楼/);
delete config.locals[floorId];assert.equal(effectiveBaseline(config,floorId),config.global);
const report={passed:true,checks:['平面坐标与旋转基准坐标往返','基准原点映射为零','未设置局部时继承整楼','修改整楼保留局部覆盖','恢复继承','备份JSON往返','拒绝其他模型的备份','拒绝不存在楼面或非法坐标','局部基准须有整楼基准']};
fs.writeFileSync(new URL('./baseline-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
