import bpy, os, sys, json
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import *
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]; shoes = bpy.data.objects["Kai_Shoes"]
reset(rig)
dg = bpy.context.evaluated_depsgraph_get(); ev = shoes.evaluated_get(dg); me = ev.to_mesh()
pts = [ev.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
for s, sign in (("l", 1), ("r", -1)):
    P = [p for p in pts if p.x * sign > 0]
    a = world_head(rig, "foot_" + s); b = world_head(rig, "ball_" + s); t = world_tail(rig, "ball_" + s)
    print("SHOE", s, "minz", round(min(p.z for p in P), 4), "ankle", tuple(round(x, 3) for x in a), "ball", tuple(round(x, 3) for x in b), "toe_tail", tuple(round(x, 3) for x in t),
          "heel_y", round(max(p.y for p in P), 3), "toe_y", round(min(p.y for p in P), 3))
    # sole points in the ankle-local frame of foot bone (rest)
    M = rig.matrix_world @ rig.pose.bones["foot_" + s].matrix
    loc = [M.inverted() @ p for p in P if p.z < 0.01]
    print("SOLE_LOCAL", s, "n", len(loc), "y_range", round(min(q.y for q in loc), 3), round(max(q.y for q in loc), 3))
