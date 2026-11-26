export function applyRouteReview(face,route,id,all){
 const raw=(all||[]).find(r=>r.approved&&r.id===id&&r.faceId===face.id);
 if(!raw)return {route,review:null,issues:[]};
 const fail=reason=>({route,review:null,issues:['核算参数未采用：'+reason]});
 if(!Number.isFinite(face.area)||!Number.isFinite(raw.sourceArea)||!Number.isFinite(raw.sourceHeight)||!raw.start||!raw.end||Math.hypot(...route.start.map((v,i)=>v-raw.start[i]))>.05||Math.hypot(...route.end.map((v,i)=>v-raw.end[i]))>.05||Math.abs(face.area-raw.sourceArea)>Math.max(.01,face.area*1e-7)||Math.abs(face.height-raw.sourceHeight)>.01)return fail('对应几何已变化，请重新核算本分段');
 for(const k of ['width','height','thickness','wn'])if(!Number.isFinite(raw[k]||0)||(raw[k]||0)<0)return fail(k+'必须为非负毫米数');
 if(raw.width>1200||raw.height>10000||raw.thickness>1000)return fail('梁宽、梁高或板厚超出可用范围，请检查单位mm');
 if(!['regular','yin-neck'].includes(raw.mode)||!['auto','yin','yang'].includes(raw.startType)||!['auto','yin','yang'].includes(raw.endType))return fail('阴阳端或分段类型无效');
 const next=structuredClone(route),review={...raw,applied:true,exempt:false};
 if(raw.mode==='yin-neck'){
  if(route.path.type!=='line')return fail('圆弧段须按真实半径计算，当前仅直线段支持人工WN偏移');
  if(!(raw.wn>0)||raw.wn>route.width+.1)return fail('阴线分出窄段WN必须大于0且不超过该段实际宽度');
  if(raw.wn<=200){review.exempt=true;review.reason='人工核算：阴线分出窄段WN≤200mm免放';}
  else {
   if(!['left','right'].includes(raw.yangSide))return fail('WN＞200时需指定沿路线首端到末端的左／右阳线侧');
   const offset=raw.wn<=300?50:100,sign=raw.yangSide==='left'?1:-1,u=route.end.map((v,i)=>(v-route.start[i])/route.length),n=[-u[1],u[0]],shift=sign*(route.width/2-offset);
   next.start=route.start.map((v,i)=>v+n[i]*shift);next.end=route.end.map((v,i)=>v+n[i]*shift);next.path={...route.path,start:next.start,end:next.end};review.supportOffset=offset;review.reason='人工核算：阴线分出窄段WN='+raw.wn+'mm，距'+(sign>0?'左':'右')+'阳线'+offset+'mm';
  }
 }
 return {route:next,review,issues:[]};
}
