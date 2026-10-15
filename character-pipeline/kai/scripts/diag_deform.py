"""Diagnose worst-deforming edges in a stress pose: where they are and which groups drive them."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import *
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]
G = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

def unweighted(o):
    bones = set(rig.data.bones.keys()); gi = {g.index: g.name for g in o.vertex_groups}
    return sum(1 for v in o.data.vertices if sum(g.weight for g in v.groups if gi.get(g.group) in bones) < 1e-4)

for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == rig and len(o.vertex_groups) > 4:
        print("UNWEIGHTED", o.name, unweighted(o), "of", len(o.data.vertices))

def worst(o, label, k=6):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); me = ev.to_mesh()
    gi = {g.index: g.name for g in o.vertex_groups}
    rows = []
    for e in o.data.edges:
        a, b = e.vertices
        L0 = (o.data.vertices[a].co - o.data.vertices[b].co).length
        if L0 < 1e-6: continue
        L = (me.vertices[a].co - me.vertices[b].co).length
        rows.append((L / L0, a, b))
    rows.sort()
    def desc(i):
        v = o.data.vertices[i]
        top = sorted(((g.weight, gi.get(g.group)) for g in v.groups if gi.get(g.group) in rig.data.bones), reverse=True)[:3]
        return tuple(round(c, 3) for c in v.co), [(n, round(w, 2)) for w, n in top]
    print(label, o.name, "STRETCH", [(round(r, 2), desc(a)) for r, a, b in rows[-k:]])
    print(label, o.name, "COMPRESS", [(round(r, 2), desc(a)) for r, a, b in rows[:k]])
    ev.to_mesh_clear()

reset(rig)
for k, q in G["grip_q"].items(): rig.pose.bones[k].rotation_quaternion = Quaternion(q)
bpy.context.view_layer.update()
worst(bpy.data.objects["Kai_Body"], "GRIP_ONLY")
reset(rig)
worst(bpy.data.objects["Kai_Body"], "REST")
worst(bpy.data.objects["Kai_Shirt"], "REST")
