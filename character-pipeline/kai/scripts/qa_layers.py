"""Layer-order QA by radial rays: along each ray from the body axis, the outermost hit must be the outer garment."""
import bpy, bmesh, os, math, sys
from mathutils.bvhtree import BVHTree
from mathutils import Vector
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "kai_03_outfit.blend"
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, src))
dg = bpy.context.evaluated_depsgraph_get()
def tree(n):
    o = bpy.data.objects[n].evaluated_get(dg); bm = bmesh.new(); bm.from_mesh(o.to_mesh()); bm.transform(o.matrix_world)
    return BVHTree.FromBMesh(bm)
T = {n: tree(n) for n in ("Kai_Body", "Kai_Shirt", "Kai_Shorts")}
def far_hit(t, o, d):
    best = None; p = o.copy()
    for _ in range(8):
        h = t.ray_cast(p, d, 1.0)
        if h[0] is None: break
        best = (h[0] - o).length; p = h[0] + d * 1e-4
    return best
res = {}
for z in [x / 100 for x in range(92, 156, 2)]:
    bad = tot = 0
    for k in range(72):
        a = 2 * math.pi * k / 72; d = Vector((math.sin(a), -math.cos(a), 0))
        o = Vector((0, 0.0, z))
        hb, hs, hp = far_hit(T["Kai_Body"], o, d), far_hit(T["Kai_Shirt"], o, d), far_hit(T["Kai_Shorts"], o, d)
        if hs is None: continue
        tot += 1
        if (hb and hb > hs - 0.001) or (hp and hp > hs - 0.001):
            bad += 1
    res[z] = (bad, tot)
print("LAYER_RAYS", {k: v for k, v in res.items() if v[1]})
print("LAYER_BAD_TOTAL", sum(v[0] for v in res.values()), "OF", sum(v[1] for v in res.values()))
# which directions fail at z=1.3?
z = 1.3; out = []
for k in range(72):
    a = 2 * math.pi * k / 72; d = Vector((math.sin(a), -math.cos(a), 0)); o = Vector((0, 0, z))
    hb, hs = far_hit(T["Kai_Body"], o, d), far_hit(T["Kai_Shirt"], o, d)
    if hs and hb and hb > hs - 0.001: out.append((k * 5, round(hb, 3), round(hs, 3)))
print("FAIL_DIRS_Z1.3", out)
