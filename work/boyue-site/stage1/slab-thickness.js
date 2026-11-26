// Lookup fallback only. Native geometry and the original input remain unchanged.
export const UNIDENTIFIED_SLAB_THICKNESS=150;
const legacyMissingIssues=new Set(['邻域没有可靠板厚，暂不猜测查表列','300mm邻域内没有已确认板厚，暂不猜测查表列']);
export function resolveSlabThickness(value){
 const measured=Number.isFinite(value)&&value>0,identified=measured&&value>=100&&value<=250;
 return {sourceValue:measured?value:null,calculationValue:identified?value:UNIDENTIFIED_SLAB_THICKNESS,defaulted:!identified,outOfRange:measured&&!identified,reason:identified?'采用已识别板厚':measured?'识别板厚'+value+'mm超出索引100～250mm，按修正版采用150mm查表；保留真实几何及原始读数':'板厚未识别，按用户规则采用150mm参与查表计算；不代表实测板厚'};
}
export function withBeamSlabThickness(beam){
 const slabThickness=resolveSlabThickness(beam.thickness);
 return {...beam,thickness:slabThickness.calculationValue,slabThickness,issues:(beam.issues||[]).filter(issue=>!slabThickness.defaulted||!legacyMissingIssues.has(issue))};
}
