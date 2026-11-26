// Rule selection is shared by GL, ordinary spans and post-split junction review.
// It never changes an original yin/yang edge to force a preferred case.
export function matchBeamPattern(beam,{kind='ordinary',junctions=[]}={}){
 const ends=beam.ends||[],yang=ends.filter(e=>e.type==='yang').length,endCase=yang===1?1:yang===2?2:3;
 const usable=junctions.filter(j=>['placed','pending'].includes(j.status)&&j.exclusionType!=='exempt-region'&&j.heightDifference<100-1e-5);
 if(beam.calculationExempt||beam.calculationPart?.exempt)return {id:'exempt-yin-neck',label:'阴线窄段免放',endCase,exempt:true,junctions:[]};
 if(ends.length!==2||ends.some(e=>!['yin','yang'].includes(e.type)))return {id:'unresolved-ends',label:'阴阳端待核对',endCase:null,exempt:false,junctions:usable.map(j=>j.id)};
 if(usable.length)return {id:'beam-junction-2.2',label:'梁情况2.2：高差＜100，真实交点分GTT',endCase,exempt:false,junctions:usable.map(j=>j.id)};
 if(beam.stairBeam)return {id:'stair-centre-first',label:'楼梯梁：整根GTT优先居中，端距1300复核',endCase:3,exempt:false,junctions:[]};
 if(beam.closed)return {id:'closed',label:'闭环梁：连续弧长布置',endCase,exempt:false,junctions:[]};
 if(beam.curveSegment||beam.path?.type==='arc')return {id:'arc',label:'圆弧梁：真实弧长居中／等分',endCase,exempt:false,junctions:[]};
 const id=kind==='gl'?'gl-'+endCase:yang?'yang-end-'+endCase:'ordinary-double-yin';
 return {id,label:kind==='gl'?'挂梁情况'+endCase:yang?'阳端布置：按挂梁情况'+endCase:'梁情况1：双阴端按GTT补点',endCase,exempt:false,junctions:[]};
}
