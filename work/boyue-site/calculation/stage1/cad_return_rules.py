"""CAD review rules: derive calculation segments without editing native source geometry."""
import copy,math
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union

def at(p,t):
    if p['type']=='line':return [p['start'][i]+t*(p['end'][i]-p['start'][i])/p['length'] for i in range(2)]
    a=p['angle']+p['sweep']*t/p['length'];return [p['center'][0]+p['radius']*math.cos(a),p['center'][1]+p['radius']*math.sin(a)]

def apply_cad_rules(raw,data):
    out=copy.deepcopy(raw);plans={p['key']:p for p in data['plans']};bygroup={g['id']:g for g in out['groups']};routes=[]
    for g in out['groups']:
        g['geometricHeight']=g['height'];g['height']=round(plans[g['key']]['level']-g['bottom'],6)
        g['lookupHeightBasis']='本层楼面标高−主梁底标高；上翻及企口保留真实几何，不叠加到查表梁高'
        g['routes']=[];g['curveCuts']=[]
    for old in out['beams']:
        g=bygroup[old['groupId']];paths=old['path'].get('parts',[old['path']])
        # Native circular/linear primitives provide exact tangent splits, not drawing seams.
        separate=not old['closed'] and (len(paths)>1 or paths[0]['type']=='arc')
        paths=paths if separate else [old['path']]
        for k,path in enumerate(paths):
            b=copy.deepcopy(old);b['geometricHeight']=old['height'];b['height']=g['height'];b['lookupHeightBasis']=g['lookupHeightBasis'];b['cadReviewSource']='CAD-RETURN-20261116'
            b['parentRoute']=old['id'];b['path']=copy.deepcopy(path);b['id']=old['id']+('/P'+str(k+1).zfill(2) if len(paths)>1 else '')
            b['curveSegment']=bool(separate and path['type']=='arc');b['length']=path['length'];b['gw']=b['width']=round(path['gw'],3)
            b['start']=at(path,0) if path['type']!='chain' else old['start'];b['end']=at(path,path['length']) if path['type']!='chain' else old['end']
            if separate:
                b['ends']=[copy.deepcopy(old['ends'][0]) if k==0 else dict(type='yang',nativeType='calculation-cut',curveSplit=True,at=b['start'],yinPriority=False,evidence='三维弧直相切处分段的计算端；按端部GLL1取点，非原阴线'),copy.deepcopy(old['ends'][1]) if k==len(paths)-1 else dict(type='yang',nativeType='calculation-cut',curveSplit=True,at=b['end'],yinPriority=False,evidence='三维弧直相切处分段的计算端；按端部GLL1取点，非原阴线')]
                b['curveNeighborOffsets']=[(100 if paths[k-1]['gw']<=150.025 else 50) if k>0 and paths[k-1]['type']=='line' else 0,(100 if paths[k+1]['gw']<=150.025 else 50) if k<len(paths)-1 and paths[k+1]['type']=='line' else 0]
                for i,e in enumerate(b['ends']):
                    if e.get('curveSplit'):
                        p=b['start'] if i==0 else b['end'];cut=dict(at=p,parent=old['id'],type='三维弧直相切计算分界',confirmed=True)
                        if not any(math.dist(c['at'],p)<.05 for c in g['curveCuts']):g['curveCuts'].append(cut)
            # Coplanar rebate lips can shorten the extracted parallel pair by 20mm.
            # Extend only to an actual cell cap, <=50mm, without changing the source face.
            if path['type']=='line':
                cell=unary_union([Polygon(r['polygon'],r['holes']) for r in old['calculationPart']['region']]);u=[(b['end'][j]-b['start'][j])/b['length'] for j in range(2)]
                line=LineString([[b['start'][j]-u[j]*51 for j in range(2)],[b['end'][j]+u[j]*51 for j in range(2)]])
                hit=cell.intersection(line);pieces=[hit] if hit.geom_type=='LineString' else [p for p in getattr(hit,'geoms',[]) if p.geom_type=='LineString']
                same=[q for q in pieces if q.distance(Point(at(path,path['length']/2)))<.03]
                if same and g['rebateMerged']:
                    coords=list(max(same,key=lambda q:q.length).coords);ts=[sum((q[j]-b['start'][j])*u[j] for j in range(2)) for q in coords];lo,hi=min(ts),max(ts)
                    lo=lo if -.001>lo>=-50.025 and not b['ends'][0].get('curveSplit') else 0
                    hi=hi if b['length']+.001<hi<=b['length']+50.025 and not b['ends'][1].get('curveSplit') else b['length']
                    if lo<0 or hi>b['length']:
                        b['capCorrection']={'fromLength':b['length'],'extensions':[-lo,hi-b['length']],'reason':'企口合并后按真实计算分区端面取完整长度'}
                        aa=[b['start'][j]+u[j]*lo for j in range(2)];bb=[b['start'][j]+u[j]*hi for j in range(2)];b['start']=aa;b['end']=bb;b['length']=hi-lo;b['path'].update(start=aa,end=bb,length=hi-lo)
                # Equal-width strips with two native outer sides use their geometric centre.
                if any('两个候选阳线侧' in s for s in b['issues']) and abs(old['calculationPart']['width']-b['gw'])<.05:
                    b['issues']=[s for s in b['issues'] if '两个候选阳线侧' not in s];b['offsetRule']=None;b['centerRule']='两侧均为实际外边的等宽段，按实体宽度居中；不任意选侧'
                u=[(b['end'][j]-b['start'][j])/b['length'] for j in range(2)];b['axisAngleDeg']=math.degrees(math.atan2(u[1],u[0]));b['parallelBoundaryRecognized']=True
            if separate and b['gw']<=200.025 and g['yinCuts'] and any(r['path']['gw']>b['gw']+.1 for r in raw['beams'] if r['groupId']==g['id']):
                b['calculationExempt']=True;b['issues']=[];b['exemptionReason']='按弧直分开后识别的阴线窄段WN≤200；普通等宽200mm梁仍计算'
            g['routes'].append(b['id']);routes.append(b)
    # CAD supplies these missing calculation axes and explicit cross-section widths.
    # They are supplementary evidence, admitted only if the entire axis is on the
    # existing classified native beam footprint. No slab footprint is promoted.
    supplements=[dict(id='CAD-A01',a=[4750,500],b=[4750,1300],gw=400,handles=['919B','760E'],curveEnds=[True,False]),dict(id='CAD-A02',a=[5300,-50],b=[7653.2115075603215,-50],gw=400,handles=['919A','760F','7610','7CBD'],curveEnds=[True,True]),dict(id='CAD-D01',a=[8179.888346275909,219.06495624506988],b=[8979.79408548589,1325],gw=400,handles=['9253','7611','8CE5','AF38','9C31'],curveEnds=[True,False])]
    g=bygroup['even/PB003'];shape=unary_union([Polygon(r['polygon'],r['holes']) for r in g['region']]);template=next(b for b in routes if b['groupId']==g['id']);cell=next(c for c in g['calculationParts'] if c['id'].endswith('C03'))
    for item in supplements:
        a,b=item['a'],item['b'];assert shape.buffer(.05).covers(LineString([a,b])),item['id']
        row=copy.deepcopy(template);length=math.dist(a,b);row.update(id=g['id']+'/'+item['id'],parentRoute=g['id']+'/'+item['id'],path=dict(type='line',start=a,end=b,length=length,gw=item['gw']),start=a,end=b,length=length,width=item['gw'],gw=item['gw'],issues=[],curveSegment=False,calculationPart=cell,offsetRule=None,closed=False,widthTransitionCase=2,baselineScope='global',parallelBoundaryRecognized=True,axisAngleDeg=math.degrees(math.atan2(b[1]-a[1],b[0]-a[0])),cadAxisEvidence=dict(handles=item['handles'],rule='用户修正版补充计算轴线；整段已与实际三维梁面相交核验',width=item['gw'],source='铂悦府6号_第3层_点位修改(修正版).dwg'))
        row['ends']=[dict(type='yang' if flag else 'yin',nativeType='calculation-cut' if flag else 'yin',curveSplit=flag,yinPriority=not flag,at=p,evidence='修正版确认的弧直分段计算端' if flag else '保持接梁处阴线') for p,flag in zip([a,b],item['curveEnds'])]
        row.pop('capCorrection',None);row.pop('centerRule',None);g['routes'].append(row['id']);routes.append(row)
    # The edited horizontal / vertical axes continue to their real intersection.
    for b in routes:
        if b['parentRoute']=='even/PB003/R04' and b['path']['type']=='line' and abs(b['start'][1]-1325)<.01:
            aa=[8975,1325];assert shape.buffer(.05).covers(LineString([aa,b['end']]));b['start']=aa;b['path']['start']=aa;b['length']=b['path']['length']=math.dist(aa,b['end']);b['ends'][0]=dict(type='yin',nativeType='yin',yinPriority=True,at=aa,evidence='修正版保留阴线，延长至实际梁梁中心线交点');b['cadAxisEvidence']=dict(handles=['16D','9A81','9ACB'],rule='修正版补全真实梁面内交点连接段')
        if b['parentRoute']=='even/PB003/R05':
            aa=[8975,1325];assert shape.buffer(.05).covers(LineString([aa,b['end']]));b['start']=aa;b['path']['start']=aa;b['length']=b['path']['length']=math.dist(aa,b['end']);b['ends'][0]=dict(type='yin',nativeType='yin',yinPriority=True,at=aa,evidence='修正版保留阴线，延长至实际梁梁中心线交点');b['cadAxisEvidence']=dict(handles=['16E','9ACB'],rule='修正版补全真实梁面内交点连接段')
    out['beams']=routes
    # Re-evaluate adjacent slab evidence per calculation segment. The thickest
    # slab near a remote bend must not select the column for the entire beam.
    for b in routes:
        if b['path']['type']=='chain':continue
        n=max(1,math.ceil(b['length']/30));axis=LineString([at(b['path'],b['length']*k/n) for k in range(n+1)]);evidence=[]
        for z in plans[b['key']]['zones']:
            if z['kind']!='slab' or not z.get('geometricDepth'):continue
            shape=unary_union([Polygon(r['polygon'],r['holes']) for r in z['region']]);near=axis.intersection(shape.buffer(b['gw']/2+300)).length
            if near>.1:evidence.append(dict(id=z['id'],thickness=z['geometricDepth'],distance=round(shape.distance(axis),3),adjacentLength=round(near,3)))
        if evidence:
            b['previousGroupThickness']=b['thickness'];b['thickness']=max(q['thickness'] for q in evidence);b['slabEvidence']=evidence;b['slabEvidenceScope']='仅当前计算段邻域，仍向上取板厚档位'
    for g in out['groups']:
        for c in g['calculationParts']:
            if not c['exempt']:c['routeCount']=sum(b['calculationPart']['id']==c['id'] for b in routes)
    out['rules'].update(cadReview='CAD-RETURN-20261116',longEndMin=0,longEndPositive=True,longEndMaxDeduction=100,height='story-level-minus-dominant-beam-bottom',arcSpacing='tangent-split-and-exact-equal-arc-parts',arcModulusException='圆弧点按真实弧长等分；直线仍按基准50mm模数',diagonalBaseline='explicit-route-baseline-required',floorAndGLUnchanged=True)
    return out
