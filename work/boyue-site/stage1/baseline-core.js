export const SCHEMA='boyue-baselines-v1';
export const normalizeAngle=a=>((a+180)%360+360)%360-180;
export function toBaseline(point,base){const a=base.angleDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=point[0]-base.origin[0],y=point[1]-base.origin[1];return [x*c+y*s,-x*s+y*c];}
export function fromBaseline(point,base){const a=base.angleDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [base.origin[0]+point[0]*c-point[1]*s,base.origin[1]+point[0]*s+point[1]*c];}
export function geometryKey(data){return [data.drawingSha256,...data.plans.map(p=>p.key+':'+p.sha256).sort()].join('|');}
export function validatePoint(value){
 if(!value||!Array.isArray(value.origin)||value.origin.length!==2||!value.origin.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e8)||typeof value.angleDeg!=='number'||!Number.isFinite(value.angleDeg)||Math.abs(value.angleDeg)>1e6)throw Error('基准坐标或角度无效，请输入有限数值。');
 return {origin:[...value.origin],angleDeg:normalizeAngle(value.angleDeg)};
}
export function validateSettings(raw,key,validFloors){
 if(!raw||raw.schema!==SCHEMA||raw.geometryKey!==key)throw Error('该备份对应其他模型版本，未应用。请使用当前模型的基准备份。');
 const config={schema:SCHEMA,geometryKey:key,revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0,updatedAt:typeof raw.updatedAt==='string'&&Number.isFinite(Date.parse(raw.updatedAt))?raw.updatedAt:null,global:raw.global?validatePoint(raw.global):null,locals:{}};
 if(!raw.locals||typeof raw.locals!=='object'||Array.isArray(raw.locals))throw Error('备份中的楼面基准格式无效。');
 for(const [id,value] of Object.entries(raw.locals)){if(!validFloors.has(id))throw Error('备份含当前模型中不存在的楼面，未应用。');config.locals[id]=validatePoint(value);}
 if(Object.keys(config.locals).length&&!config.global)throw Error('局部基准备份缺少整楼基准，未应用。');return config;
}
export function effectiveBaseline(config,floorId){return config.locals[floorId]||config.global;}
