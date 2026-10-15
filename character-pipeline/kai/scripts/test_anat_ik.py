import bpy, os, sys, math
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, reset, world_head, world_tail
from anat_ik import *
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]
for o in bpy.data.objects:
    for m in o.modifiers:
        if m.type == 'ARMATURE': m.show_viewport = False
reset(rig)
tests = [("upperarm_r", "lowerarm_r", Vector((-0.4, -0.3, 1.9)), Vector((0, 1, -1))),
         ("upperarm_r", "lowerarm_r", Vector((-0.2, 0.1, 1.2)), Vector((-1, 0, 0))),
         ("upperarm_l", "lowerarm_l", Vector((0.3, -0.4, 1.3)), Vector((1, 0.2, -1))),
         ("thigh_l", "calf_l", Vector((0.15, -0.3, 0.25)), Vector((0, -1, 0)))]
for up, lo, tgt, pole in tests:
    reset(rig); bpy.context.view_layer.update()
    sh = world_head(rig, up)
    Mu, Ml, E, ok = hinge_solve(rig, up, lo, sh, tgt, pole)
    set_world3(rig, up, Mu); bpy.context.view_layer.update()
    set_world3(rig, lo, Ml); bpy.context.view_layer.update()
    err = (world_tail(rig, lo) - tgt).length
    el = (world_head(rig, lo) - E).length
    # hinge purity: lower local rotation must be about the rest hinge axis only
    q = rig.pose.bones[lo].rotation_quaternion
    print("IKTEST", up, "tip_err_mm", round(err * 1000, 2), "elbow_err_mm", round(el * 1000, 2), "reach", ok,
          "lower_rot_deg", round(math.degrees(q.angle), 1))
