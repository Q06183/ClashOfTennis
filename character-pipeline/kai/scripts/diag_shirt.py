import bpy, os, sys, json
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import *
import importlib.util
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]; shirt = bpy.data.objects["Kai_Shirt"]
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
bones = set(rig.data.bones.keys())
gi = {g.index: g.name for g in shirt.vertex_groups}
bad_norm = [v.index for v in shirt.data.vertices if abs(sum(g.weight for g in v.groups if gi.get(g.group) in bones) - 1) > 0.01]
print("NOTNORM", len(bad_norm), [ (tuple(round(c,3) for c in shirt.data.vertices[i].co), [(gi[g.group], round(g.weight,2)) for g in shirt.data.vertices[i].groups]) for i in bad_norm[:4]])
print("NONBONE_GROUPS", [g.name for g in shirt.vertex_groups if g.name not in bones][:20])
reset(rig)
chain_rot(rig, [("pelvis", Z, 45), ("spine_01", Z, 15), ("spine_02", Z, 20), ("spine_03", Z, 25)])
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); ev = shirt.evaluated_get(dg); me = ev.to_mesh()
rows = []
for e in shirt.data.edges:
    a, b = e.vertices
    L0 = (shirt.data.vertices[a].co - shirt.data.vertices[b].co).length
    if L0 < 1e-6: continue
    rows.append(((me.vertices[a].co - me.vertices[b].co).length / L0, a, b, L0))
rows.sort()
def top(i):
    return sorted([(gi[g.group], round(g.weight, 2)) for g in shirt.data.vertices[i].groups], key=lambda t: -t[1])[:3]
for r, a, b, L0 in rows[-8:]:
    print("BAD", round(r, 1), "L0", round(L0, 4), tuple(round(x, 3) for x in shirt.data.vertices[a].co), top(a), "|", tuple(round(x, 3) for x in shirt.data.vertices[b].co), top(b))
# distribution of short edges among bad
print("BAD_L0_HIST", sum(1 for r,a,b,L0 in rows if r>1.6 and L0<0.004), "short of", sum(1 for r,a,b,L0 in rows if r>1.6))
