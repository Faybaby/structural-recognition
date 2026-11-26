"""Finite candidate alignment against real shared supports, with geometry checks."""
import math,collections
from shapely.geometry import Point,LineString
from compact_floor import coverage_missing,spacing_pass
from overlap_calculation import key

def connected(at,anchors,footprint,limit):
 out=[]
 for a in anchors:
  if math.dist(at,a)<.11:continue
  if (abs(at[0]-a[0])<1e-6 or abs(at[1]-a[1])<1e-6) and math.dist(at,a)<=limit+.11 and footprint.buffer(.11).covers(LineString([at,a])):out.append(a)
 return out

def align_floor(g,sx,sy,holes,anchors,footprint,fallback):
 x0,y0,x1,y1=g.bounds
 near=[a for a in anchors if g.distance(Point(a))<=max(sx,sy)+.11]
 if not near:return dict(nodes=fallback,matched=0,tested=0,status='无可连接公共点，保留独立候选并列复核')
 def axes(lo,hi,limit,axis):
  vals=sorted({round(a[axis],1) for a in near if lo-limit<=a[axis]<=hi+limit})
  # Actual shared coordinates define phases; no invented global origin.
  vals=sorted(vals,key=lambda v:abs(v-(lo+hi)/2))[:16];out=[]
  for seed in vals:
   for step in [limit,limit/2]:
    seq=[round(seed+k*step,1) for k in range(math.ceil((lo-seed)/step),math.floor((hi-seed)/step)+1)]
    if seq and seq[0]-lo<=limit+.11 and hi-seq[-1]<=limit+.11:out.append(seq)
  return out
 variants=[];tested=0
 xx=axes(x0,x1,sx,0);yy=axes(y0,y1,sy,1)
 for xs in xx:
  for ys in yy:
   tested+=1;ns=sorted({key([x,y]) for x in xs for y in ys if g.buffer(.11).covers(Point(x,y)) and holes.distance(Point(x,y))>=150})
   if not ns or coverage_missing(g,ns,sx,sy)>1 or not spacing_pass(g,ns,sx,sy):continue
   pairs={(tuple(at),tuple(a)) for at in ns for a in connected(at,near,footprint,min(sx,sy))};matched={a for at,a in pairs}
   if not pairs:continue
   target=min(2,len(near));rank=(max(0,target-len(matched)),len(ns),-len(matched),sum(math.dist(at,[(x0+x1)/2,(y0+y1)/2]) for at in ns))
   variants.append((rank,ns,len(pairs)))
 if not variants:return dict(nodes=fallback,matched=0,tested=tested,status='约束冲突，未强制移动，待对齐复核')
 _,ns,n=min(variants,key=lambda q:q[0]);return dict(nodes=ns,matched=n,tested=tested,status='按公共点真实X/Y坐标重新布置，已形成接口连接')
