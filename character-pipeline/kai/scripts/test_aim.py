import bpy, os, sys, json
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import *
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def fwd(b):  # where does the bone's "front" (-Y world at rest) point now
    pb = rig.pose.bones[b]; R = pb.matrix.to_3x3() @ pb.bone.matrix_local.to_3x3().inverted()
    return tuple(round(x, 2) for x in (R @ Vector((0, -1, 0))))
def dirn(b):
    pb = rig.pose.bones[b]; return tuple(round(x, 2) for x in (pb.tail - pb.head).normalized())
reset(rig); chain_rot(rig, [("pelvis", Z, 35)]); bpy.context.view_layer.update()
print("PELVIS_Z35 front", fwd("pelvis"), "spine03 front", fwd("spine_03"), "head pos", tuple(round(x,3) for x in world_head(rig, "head")))
reset(rig); chain_rot(rig, [("thigh_l", X, -35)]); bpy.context.view_layer.update()
print("THIGH_X-35 dir", dirn("thigh_l"), "(expect forward -Y component => hip flexion)")
reset(rig); chain_rot(rig, [("calf_l", X, 60)]); bpy.context.view_layer.update()
print("CALF_X60 dir", dirn("calf_l"), "(expect +Y => knee flexion)")
reset(rig); chain_rot(rig, [("spine_03", X, -10)]); bpy.context.view_layer.update()
print("SPINE03_X-10 head", tuple(round(x,3) for x in world_head(rig, "head")), "(expect +Y => lean back)")
reset(rig); chain_rot(rig, [("spine_03", Y, 8)]); bpy.context.view_layer.update()
print("SPINE03_Y8 head", tuple(round(x,3) for x in world_head(rig, "head")))
# chained: thigh then calf
reset(rig); chain_rot(rig, [("thigh_l", X, -35), ("calf_l", X, 60)]); bpy.context.view_layer.update()
print("THIGH+CALF thigh", dirn("thigh_l"), "calf", dirn("calf_l"), "ankle", tuple(round(x,3) for x in world_head(rig, "foot_l")))
