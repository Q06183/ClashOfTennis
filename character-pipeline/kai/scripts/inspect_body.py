import bpy, os, json
from mathutils import Vector
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "kai_01_body.blend"))
b = bpy.data.objects["Kai_Body"]
print("MODS", [(m.name, m.type) for m in b.modifiers])
print("SHAPEKEYS", len(b.data.shape_keys.key_blocks) if b.data.shape_keys else 0)
print("UV", [u.name for u in b.data.uv_layers])
print("MATS", [m.name if m else None for m in b.data.materials])
vg = {g.index: g.name for g in b.vertex_groups}
cnt = {}
for v in b.data.vertices:
    for g in v.groups:
        n = vg[g.group]
        if n.startswith("helper") or n in ("body",):
            cnt[n] = cnt.get(n, 0) + 1
print("GROUPCOUNTS", cnt)
print("POLYS", len(b.data.polygons))
