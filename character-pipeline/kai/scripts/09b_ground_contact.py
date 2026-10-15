"""Groundstroke foot contact solver: same plant-and-lock as 06b applied to both Forehand/Backhand actions.

Groundstrokes stay planted (no drag windows). A foot is locked from the first frame its sole is within
PLANT_Z of the floor until it lifts again; horizontal position is held via leg IK, sole placed exactly on
z=0. Runs on kai_07_ground.blend, both actions, saves in place.
"""
import bpy, os, sys, json, math
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, two_bone_ik, world_head, world_tail
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
rig = bpy.data.objects["Kai_Rig"]; shoes = bpy.data.objects["Kai_Shoes"]
PLANS = json.load(open(os.path.join(ROOT, "qa", "ground_plan.json")))
sc = bpy.context.scene

def shoe_pts(side):
    bpy.context.view_layer.update()
    ev = shoes.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    a = world_head(rig, "foot_"+side); o = world_head(rig, "foot_"+("r" if side=="l" else "l"))
    P = [ev.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    return [p for p in P if (p-a).length < (p-o).length]

def patch(P):
    zmin = min(p.z for p in P); sole = [p for p in P if p.z < zmin+0.006]
    return zmin, sum(sole, Vector())/len(sole)

def shift_leg(side, delta):
    bpy.context.view_layer.update()
    pf, pb = rig.pose.bones["foot_"+side], rig.pose.bones["ball_"+side]
    Rf = (rig.matrix_world @ pf.matrix).to_3x3().copy(); Rb = (rig.matrix_world @ pb.matrix).to_3x3().copy()
    ankle = world_head(rig, "foot_"+side) + delta
    knee = world_tail(rig, "thigh_"+side); hip = world_head(rig, "thigh_"+side)
    mid = (hip+ankle)*0.5; pole = knee-mid
    if pole.length < 1e-4: pole = Vector((0,-1,0))
    two_bone_ik(rig, "thigh_"+side, "calf_"+side, ankle, hip+pole.normalized())
    for name, R in (("foot_"+side, Rf), ("ball_"+side, Rb)):
        pbn = rig.pose.bones[name]; bpy.context.view_layer.update()
        base = pbn.parent.matrix @ pbn.parent.bone.matrix_local.inverted() @ pbn.bone.matrix_local
        pbn.rotation_quaternion = (base.to_3x3().inverted() @ R).to_quaternion()
    bpy.context.view_layer.update()

PLANT_Z = 0.025
report = {}
for name in ("Forehand", "Backhand"):
    T = PLANS[name]["T"]; nF = T["end"]
    rig.animation_data.action = bpy.data.actions[name]
    sc.frame_start, sc.frame_end = 1, nF
    lock = {"l": None, "r": None}; nfix = 0
    for f in range(1, nF+1):
        sc.frame_set(f)
        for side in ("l", "r"):
            for _ in range(3):
                zmin, c = patch(shoe_pts(side))
                if zmin >= PLANT_Z:
                    lock[side] = None; break
                if lock[side] is None:
                    lock[side] = Vector((c.x, c.y, 0))
                d = Vector((lock[side].x-c.x, lock[side].y-c.y, -zmin+0.0006))
                if d.length < 0.0008: break
                shift_leg(side, d); nfix += 1
        for pb in rig.pose.bones:
            if pb.name.split("_")[0] in ("thigh","calf","foot","ball"):
                pb.keyframe_insert("rotation_quaternion", frame=f)
    report[name] = nfix
    print(name, "leg fixes", nfix)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
print("SAVED", report)
