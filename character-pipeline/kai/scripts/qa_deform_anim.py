"""Mesh deformation audit over the WHOLE animation: per frame, edge-length strain of body & shirt
relative to the rest mesh (p99 / max / count of edges stretched > 1.6x or squashed < 0.4x).
Pass rule (same as step-5 stress test): body p99 <= 1.5, no edge > 2.5x, shirt p99 <= 1.6."""
import bpy, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT
src = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "kai_05_serve.blend"
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, src))
sc = bpy.context.scene
objs = [bpy.data.objects[n] for n in ("Kai_Body", "Kai_Shirt") if n in bpy.data.objects]
rig = bpy.data.objects["Kai_Rig"]
pos = rig.data.pose_position; rig.data.pose_position = 'REST'; bpy.context.view_layer.update()
REST = {}
for o in objs:
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    REST[o.name] = [(me.vertices[e.vertices[0]].co - me.vertices[e.vertices[1]].co).length for e in o.data.edges]
    ev.to_mesh_clear()
rig.data.pose_position = 'POSE'
out = {}
for f in range(sc.frame_start, sc.frame_end + 1, 3):
    sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        rs = sorted((me.vertices[e.vertices[0]].co - me.vertices[e.vertices[1]].co).length / L0
                    for e, L0 in zip(o.data.edges, REST[o.name]) if L0 > 1e-6)
        ev.to_mesh_clear(); n = len(rs)
        r = out.setdefault(o.name, {"p99": 0, "max": 0, "p01": 9, "worst_f": None, "over16": 0})
        if rs[int(n * .99)] > r["p99"]: r["p99"], r["worst_f"] = round(rs[int(n * .99)], 3), f
        r["max"] = max(r["max"], round(rs[-1], 3)); r["p01"] = min(r["p01"], round(rs[int(n * .01)], 3))
        r["over16"] = max(r["over16"], sum(1 for x in rs if x > 1.6))
b = out.get("Kai_Body", {}); s = out.get("Kai_Shirt", {})
ok = b.get("p99", 9) <= 1.5 and b.get("max", 9) <= 2.5 and s.get("p99", 0) <= 1.6
print("DEFORM", json.dumps(out), "PASS" if ok else "FAIL")
json.dump({"objects": out, "pass": ok}, open(os.path.join(ROOT, "qa", "deform_anim.json"), "w"), indent=1)
