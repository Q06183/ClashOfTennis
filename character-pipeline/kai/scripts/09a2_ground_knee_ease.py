"""Post-plant one-frame KNEE-STEP smoother.

After 09b the soles are glued, but the source BVH can step the planted leg to a new knee height in a single
frame (ankle stationary, thigh/calf snap), producing a one-frame CoM vertical-acceleration spike. This pass
finds such spikes, holds the ankle exactly where it is, and re-solves the leg with two_bone_ik while easing
the KNEE world position from the pre-step to the post-step height over a 5-frame window. The foot/sole never
moves (ground and foot-slide gates stay valid); only thigh/calf rotations are re-keyed.

Runs AFTER 09b_ground_contact and BEFORE 09c, on kai_07_ground.blend (all groundstrokes), saves in place.
"""
import bpy, os, sys, math, json
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, two_bone_ik, world_head, world_tail
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
rig = bpy.data.objects["Kai_Rig"]
PLANS = json.load(open(os.path.join(ROOT, "qa", "ground_plan.json")))
sc = bpy.context.scene

SEG = [("head","head",0.081),("spine_03","spine_03",0.216),("spine_01","spine_02",0.139),
       ("pelvis","pelvis",0.142),("upperarm_l","upperarm_l",0.028),("upperarm_r","upperarm_r",0.028),
       ("lowerarm_l","lowerarm_l",0.016),("lowerarm_r","lowerarm_r",0.016),("hand_l","hand_l",0.006),
       ("hand_r","hand_r",0.006),("thigh_l","thigh_l",0.10),("thigh_r","thigh_r",0.10),
       ("calf_l","calf_l",0.0465),("calf_r","calf_r",0.0465),("foot_l","foot_l",0.0145),("foot_r","foot_r",0.0145)]
FPS = 60
ACC_LIM = 45.0

def midpoint(a, b):
    pa = rig.pose.bones[a]; pb = rig.pose.bones[b]
    return ((rig.matrix_world @ pa.head) + (rig.matrix_world @ (pb.head + pb.vector))) * 0.5

def com_z():
    acc = 0.0; m = 0.0
    for a, b, w in SEG:
        acc += midpoint(a, b).z * w; m += w
    return acc / m

def knee(side):
    return world_tail(rig, "thigh_"+side).copy()

def ankle(side):
    return world_head(rig, "foot_"+side).copy()

def run(name):
    T = PLANS[name]["T"]; nF = T["end"]
    rig.animation_data.action = bpy.data.actions[name]
    sc.frame_start, sc.frame_end = 1, nF
    # baseline CoM z
    z = {}
    for f in range(1, nF+1):
        sc.frame_set(f); z[f] = com_z()
    spikes = []
    for f in range(2, nF):
        acc = (z[f+1] - 2*z[f] + z[f-1]) * FPS * FPS
        if abs(acc) > ACC_LIM:
            spikes.append((f, acc))
    fixed = []
    for f, acc in spikes:
        # choose the leg whose knee z jumps most across f-1 -> f+1
        best = None
        for side in ("l", "r"):
            sc.frame_set(f-1); k0 = knee(side).z
            sc.frame_set(f+1); k1 = knee(side).z
            dz = abs(k1 - k0)
            if best is None or dz > best[1]:
                best = (side, dz)
        side = best[0]
        sc.frame_set(f-2); k_pre = knee(side)
        sc.frame_set(f+2); k_post = knee(side)
        # ease frames f-1..f+2 (4 steps) keeping the ankle fixed at each frame's planted location
        anchors = {}
        for ff in range(f-1, f+3):
            sc.frame_set(ff); anchors[ff] = ankle(side)
        # ease weights for the knee target from pre to post
        for i, ff in enumerate(range(f-1, f+3)):
            t = (i + 1) / 5.0  # 0.2,0.4,0.6,0.8
            sc.frame_set(ff)
            kt = k_pre.lerp(k_post, t)
            hip = world_head(rig, "thigh_"+side)
            pole = (kt - (hip + anchors[ff]) * 0.5)
            if pole.length < 1e-4: pole = Vector((0, -1, 0))
            two_bone_ik(rig, "thigh_"+side, "calf_"+side, anchors[ff], hip + pole.normalized())
            bpy.context.view_layer.update()
            for bn in ("thigh_"+side, "calf_"+side):
                rig.pose.bones[bn].keyframe_insert("rotation_quaternion", frame=ff)
        fixed.append((f, round(acc, 1), side))
    print(name, "knee-eased spikes", fixed)
    return fixed

report = {}
for nm in ("Forehand", "Backhand"):
    report[nm] = run(nm)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
print("SAVED", {k: v for k, v in report.items()})
