"""Step 5c: weight hygiene.
Garments were cloned from the full body, so each garment vertex already carries the exact MPFB skin
weights of the skin under it (plus the twist split from step 5a). Only vertices created afterwards
(trim/piping strips) are unweighted: they copy the weights of their nearest weighted vertex IN THE SAME
garment (= the boundary loop they were built from). Then: prune <0.01, limit 4 influences (glTF), normalise."""
import bpy, os, sys
from mathutils.kdtree import KDTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]; body = bpy.data.objects["Kai_Body"]
bones = set(rig.data.bones.keys())

def activate(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o

def clean(o, limit=4):
    activate(o); bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=0.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=limit)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')

skinned = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig and len(o.vertex_groups) > 4]
for o in skinned:
    # drop non-bone vertex groups (MPFB region masks like 'body','nipple','Left'); they confuse weight checks/export
    for g in list(o.vertex_groups):
        if g.name not in bones: o.vertex_groups.remove(g)
    gi = {g.index: g.name for g in o.vertex_groups}
    W = [{gi[g.group]: g.weight for g in v.groups if gi.get(g.group) in bones and g.weight > 1e-4} for v in o.data.vertices]
    weighted = [i for i, w in enumerate(W) if sum(w.values()) > 0.5]
    missing = [i for i, w in enumerate(W) if sum(w.values()) <= 0.5]
    if missing:
        kd = KDTree(len(weighted))
        for j, i in enumerate(weighted): kd.insert(o.data.vertices[i].co, j)
        kd.balance()
        for i in missing:
            co, j, d = kd.find(o.data.vertices[i].co)
            src = W[weighted[j]]
            for n, w in src.items():
                (o.vertex_groups.get(n) or o.vertex_groups.new(name=n)).add([i], w, 'REPLACE')
    arms = [m for m in o.modifiers if m.type == 'ARMATURE']
    for m in arms[1:]: o.modifiers.remove(m)
    clean(o)
    gi = {g.index: g.name for g in o.vertex_groups}
    unw = sum(1 for v in o.data.vertices if abs(sum(g.weight for g in v.groups if gi.get(g.group) in bones) - 1) > 0.01)
    mx = max(len([g for g in v.groups if gi.get(g.group) in bones and g.weight > 0]) for v in o.data.vertices)
    print("WEIGHTS", o.name, "verts", len(o.data.vertices), "filled", len(missing), "not_normalised", unw, "max_influences", mx)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
print("SAVED")
