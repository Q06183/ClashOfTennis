"""Fix review issue 1 properly: the mocap player brings both arms DOWN and BACK during f28-56 (backscratch
preparation happens low, racket hangs behind the body).  The game wants a direct lift into the trophy.
Rather than rotating the racket (which over-bends the wrist), this rotates the whole RIGHT ARM chain as a
rigid unit: shoulder -> elbow -> wrist, bent about the vertical axis by an extra angle a(f), keeping arm
lengths, elbow bend and the mocap hand position height.  The racket then follows the wrist naturally.
Issue 2 (post-contact extra wrist pronation) is unchanged from review_fixes2: twist held constant from f100."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT, world_head
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
C, TR, nF = T["contact"], T["trophy"], sc.frame_end
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
Y, Z, N = Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((0, -1, 0))
def W3(n): return (rig.matrix_world.to_3x3() @ rig.pose.bones[n].matrix.to_3x3()).normalized()
def base3(n):
    pb = rig.pose.bones[n]
    return (rig.matrix_world.to_3x3() @ pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[n]).normalized()
def setw(n, R3): rig.pose.bones[n].rotation_quaternion = (base3(n).inverted() @ R3).to_quaternion()
def ease(u): u = max(0.0, min(1.0, u)); return u * u * (3 - 2 * u)
ORIG = {}
for f in range(1, nF + 1):
    sc.frame_set(f)
    ORIG[f] = {n: rig.pose.bones[n].rotation_quaternion.copy() for n in
               ("clavicle_r", "upperarm_r", "lowerarm_r", "hand_r", "upperarm_twist_01_r")}
def shoulder_centre():
    sc = bpy.context.scene
    return (rig.matrix_world @ rig.pose.bones["clavicle_r"].matrix).translation
# extra yaw of the whole arm chain about the shoulder, degrees, per frame
# ready 0; builds to 95 deg forward-rotation during f20..56 (arm behind -> in front), releases to 0 by trophy
def extra_yaw(f):
    if f < 12: return 0.0
    if 12 <= f <= 24: return ease((f - 12) / 12) * 55.0
    if 24 < f <= 52: return 55.0 + ease((f - 24) / 28) * 45.0
    if 52 < f <= TR:
        return 100.0 * (1 - ease((f - 52) / (TR - 52)))
    return 0.0
CHAIN = ("upperarm_r", "lowerarm_r", "hand_r")
for f in range(1, TR + 1):
    sc.frame_set(f)
    for n, q in ORIG[f].items(): rig.pose.bones[n].rotation_quaternion = q
    a = math.radians(extra_yaw(f))
    if abs(a) > 1e-4:
        c = shoulder_centre()
        for n in CHAIN:
            R = W3(n)
            Rn = Quaternion(Z, a).to_matrix() @ R
            setw(n, Rn)
        bpy.context.view_layer.update()
    for n in ("clavicle_r", "upperarm_r", "lowerarm_r", "hand_r", "upperarm_twist_01_r"):
        rig.pose.bones[n].keyframe_insert("rotation_quaternion", frame=f)
# check the racket never goes behind the shoulder line on its own path now
worst = 0.0
for f in range(9, TR + 1):
    sc.frame_set(f)
    tip = racket.matrix_world @ Vector((0, 0.6, 0)); sh = world_head(rig, "clavicle_r")
    worst = max(worst, (tip - sh).y)
print("ISSUE1 yaw applied; tip max behind shoulder y =", round(worst, 3))
# issue 2: freeze long-axis twist from 100
def parts(q):
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); return q @ tw.inverted(), tw
sc.frame_set(100); _, TW0 = parts(rig.pose.bones["hand_r"].rotation_quaternion); t0 = 2 * math.atan2(TW0.y, TW0.w)
for f in range(101, nF + 1):
    sc.frame_set(f); sw, tw = parts(rig.pose.bones["hand_r"].rotation_quaternion)
    t1 = 2 * math.atan2(tw.y, tw.w)
    while t1 - t0 > math.pi: t1 -= 2 * math.pi
    while t1 - t0 < -math.pi: t1 += 2 * math.pi
    u = ease((f - 100) / (nF - 100))
    rig.pose.bones["hand_r"].rotation_quaternion = sw @ Quaternion(Y, t1 * (1 - u) + t0 * u)
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
print("ISSUE2 twist frozen 101..", nF)
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json"))); G = 9.81; R_ = T["release"]
ball = bpy.data.objects["Kai_Ball"]
sc.frame_set(R_); rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C); Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Z).normalized()
if face_n.dot(N) < 0: face_n = -face_n
ball_c = Rm @ Vector((0, 0.50, 0)) + face_n * 0.0335
tf = (C - R_) / plan["fps"]; FPS = plan["fps"]
vb = (ball_c - rel_p + Vector((0, 0, 0.5 * G * tf * tf))) / tf
apex = rel_p.z + max(0, vb.z) ** 2 / (2 * G)
ball.animation_data_clear(); outv = Vector((0.05, -0.97, -0.06)).normalized() * 48.0; bp = {}
for f in range(1, nF + 1):
    if f < R_:
        sc.frame_set(f); p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
    elif f <= C:
        tt = (f - R_) / FPS; p = rel_p + vb * tt - Vector((0, 0, 0.5 * G * tt * tt))
    else:
        tt = (f - C) / FPS; p = ball_c + outv * tt - Vector((0, 0, 0.5 * G * tt * tt))
    ball.location = p; ball.keyframe_insert("location", frame=f); bp[f] = list(p)
plan.update({"toss_v": list(vb), "toss_apex": apex, "contact_ball": list(ball_c), "face_normal": list(face_n), "ball": bp,
             "review_fixes": {"arm_yaw_lift_frames": [9, TR], "post_contact_roll_removed_frames": [101, nF]}})
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
