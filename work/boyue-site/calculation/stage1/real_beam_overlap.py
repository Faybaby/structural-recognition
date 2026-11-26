"""A slab cut requires BOTH native convex-edge evidence and real beam overlap."""
from shapely.geometry import Polygon
from shapely.ops import unary_union

BOUNDARY_TOLERANCE_MM=.05

def qualified_overlap(slab,beam,yang_lines,tolerance=BOUNDARY_TOLERANCE_MM):
    # Remove boundary/chord sampling noise. Mere edge contact is not overlap.
    actual=slab.intersection(beam)
    core=slab.buffer(-tolerance).intersection(beam.buffer(-tolerance))
    if core.is_empty or core.area<=.1:
        return Polygon(),'没有实际梁面积重合（边界接触不算）'
    if not yang_lines:
        return Polygon(),'存在梁重合，但未确认阳线'
    edges=unary_union(yang_lines).intersection(actual.buffer(tolerance))
    if edges.length<=tolerance:
        return Polygon(),'阳线不在本次重合位置'
    return actual,'存在实际梁重合，且重合位置已确认原生阳线'
