"""Concave native boundary cuts. No drawing seam is used as a partition."""
import math
from shapely.geometry import Polygon, Point, LineString
from shapely.geometry.polygon import orient
from shapely.ops import split
from shapely import set_precision

def polygons(g):
    return [g] if g.geom_type == 'Polygon' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']

def yin_parts(g, prefer_narrow=False, extra_cuts=()):
    """Extend native reflex-edge tangents by the shortest interior distance."""
    g = set_precision(g, .001).buffer(0)
    cuts = []
    for poly in polygons(g):
        pts = list(orient(poly.simplify(.025, preserve_topology=True), 1).exterior.coords)[:-1]
        for i, v in enumerate(pts):
            prev, nxt = pts[i-1], pts[(i+1) % len(pts)]
            a, b = [v[j]-prev[j] for j in range(2)], [nxt[j]-v[j] for j in range(2)]
            la, lb = math.hypot(*a), math.hypot(*b)
            if min(la, lb) < 25 or (a[0]*b[1]-a[1]*b[0])/(la*lb) >= -.08:
                continue
            candidates = []
            for u in ([x/la for x in a], [-x/lb for x in b]):
                if not poly.contains(Point([v[j]+u[j]*.1 for j in range(2)])):
                    continue
                ray = LineString([v, [v[j]+u[j]*100000 for j in range(2)]])
                hit = poly.intersection(ray)
                lines = [hit] if hit.geom_type == 'LineString' else [q for q in getattr(hit, 'geoms', []) if q.geom_type == 'LineString']
                for q in lines:
                    if q.distance(Point(v)) < .05 and q.length > .1:
                        end = max(q.coords, key=lambda p: math.dist(v, p))
                        candidates.append((q.length, v, end, u))
            if candidates:
                def score(q):
                    length, start, end, u = q
                    if prefer_narrow:
                        line = LineString([[start[j]-u[j]*.1 for j in range(2)], [end[j]+u[j]*.1 for j in range(2)]])
                        fragments = polygons(split(poly, line))
                        slender = [p for p in fragments if dimensions(p)[0] <= 600.025 and dimensions(p)[1] >= max(500, dimensions(p)[0]*1.25)]
                        if slender:
                            return (0, -max(p.area for p in slender), length)
                    return (1, 0, length)
                length, start, end, u = min(candidates, key=score)
                line = LineString([[start[j]-u[j]*.1 for j in range(2)], [end[j]+u[j]*.1 for j in range(2)]])
                if not any(line.hausdorff_distance(q['line']) < .1 for q in cuts):
                    cuts.append(dict(line=line, start=list(start), end=list(end), length=length))
    for c in extra_cuts:
        a,b=c['start'],c['end'];length=math.dist(a,b)
        if length < .1:continue
        u=[(b[j]-a[j])/length for j in range(2)]
        line=LineString([[a[j]-u[j]*.1 for j in range(2)],[b[j]+u[j]*.1 for j in range(2)]])
        if not any(line.hausdorff_distance(q['line'])<.1 for q in cuts):cuts.append(dict(line=line,start=a,end=b,length=length))
    parts = polygons(g)
    for c in sorted(cuts, key=lambda q: q['length']):
        next_parts = []
        for p in parts:
            result = [v for v in polygons(split(p, c['line'])) if v.area > .1]
            if abs(sum(v.area for v in result)-p.area) > .1:
                raise ValueError('阴线切分面积不守恒')
            next_parts.extend(result)
        parts = next_parts
    return parts, [{k:v for k,v in c.items() if k != 'line'} for c in cuts]

def dimensions(g):
    pts = list(g.minimum_rotated_rectangle.exterior.coords)
    return sorted([math.dist(pts[i], pts[i+1]) for i in (0, 1)])

def narrow_arms(g, max_width=600):
    parts, cuts = yin_parts(g, prefer_narrow=True)
    if len(parts) == 1:
        return [], cuts
    largest = max(parts, key=lambda p:p.area)
    arms = []
    for p in parts:
        w, length = dimensions(p)
        if p is not largest and w <= max_width+.025 and length >= max(250, w*1.25):
            arms.append((p, w))
    return arms, cuts
