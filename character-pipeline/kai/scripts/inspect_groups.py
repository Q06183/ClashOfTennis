import bpy, os
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "kai_02_rigged_raw.blend"))
b = bpy.data.objects["Kai_Body"]
idx = {g.name: g.index for g in b.vertex_groups}
def stats(name):
    gi = idx[name]; ws = []
    for v in b.data.vertices:
        for g in v.groups:
            if g.group == gi: ws.append(g.weight)
    return len(ws), (min(ws) if ws else None), (sum(1 for w in ws if w > 0.5))
for n in ["body", "HelperGeometry", "JointCubes", "helper-l-eye", "Left", "Mid"]:
    print("VG", n, stats(n))
print("SK", [k.name for k in b.data.shape_keys.key_blocks])
