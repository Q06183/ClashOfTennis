"""Direct arm lift (review issue 1).
The mocap brings the right arm down/back (f24-56) before the trophy; the user wants a direct lift up front.
For frames 12..trophy, the upper-arm and forearm world rotations are blended from the mocap pose toward a
procedural lift: upper arm forward-and-up at shoulder height, elbow flexed ~90 so the racket rises in front;
blend weight ramps up after the ready pose and ramps back to 0 at the trophy (the mocap trophy is kept).
Issue 2: wrist long-axis twist held constant from f100 (no second pronation after contact)."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT, world_head
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
C, TR, nF, FPS = T["contact"], T["trophy"], sc.frame_end, plan["fps"]
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
    ORIG[f] = {n: rig.pose.bones[n].rotation_quaternion.copy()
               for n in ("upperarm_r", "lowerarm_r", "hand_r", "upperarm_twist_01_r", "clavicle_r")}
def frame_for(dirY, latX):
    u = dirY.normalized(); l = (latX - u * latX.dot(u)).normalized()
    return Matrix((l, u, l.cross(u))).transposed()
def weight(f):
    if f < 12 or f > TR: return 0.0
    if f <= 26: return ease((f - 12) / 14)
    if f <= 46: return 1.0
    return 1.0 - ease((f - 46) / (TR - 46))
# procedural lift directions in WORLD: upper arm forward(-Y)-up, about 100 deg abduction; forearm flexes toward up
def lift_poses(f):
    u = ease((f - 12) / max(1, TR - 12))
    arm = Vector((-0.10, -0.45 - 0.1 * u, 0.88 + 0.05 * u)).normalized()      # forward and up the whole time
    fore = Vector((-0.05, -0.20, 0.98)).normalized()                          # racket side up
    lat = Vector((1, 0, 0))
    return frame_for(arm, lat), frame_for(fore, lat)
for f in range(1, TR + 1):
    sc.frame_set(f)
    for n in ORIG[f]: rig.pose.bones[n].rotation_quaternion = ORIG[f][n]
    bpy.context.view_layer.update()
    w = weight(f)
    if w > 1e-4:
        Ra, Rf = lift_poses(f)
        qm = W3("upperarm_r").to_quaternion(); qa = Ra.to_quaternion()
        if qm.dot(qa) < 0: qa = -qa
        setw("upperarm_r", qm.slerp(qa, w).to_matrix()); bpy.context.view_layer.update()
        qm = W3("lowerarm_r").to_quaternion(); qf = Rf.to_quaternion()
        if qm.dot(qf) < 0: qf = -qf
        setw("lowerarm_r", qm.slerp(qf, w).to_matrix()); bpy.context.view_layer.update()
    for n in ORIG[f]: rig.pose.bones[n].keyframe_insert("rotation_quaternion", frame=f)
worst = 0.0
for f in range(9, TR + 1):
    sc.frame_set(f); worst = max(worst, (racket.matrix_world @ Vector((0, 0.6, 0)) - world_head(rig, "clavicle_r")).y)
print("ISSUE1 lift blend; tip max behind shoulder y =", round(worst, 3))
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
print("ISSUE2 twist frozen")
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json"))); G = 9.81; R_ = T["release"]
ball = bpy.data.objects["Kai_Ball"]
sc.frame_set(R_); rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C); Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Z).normalized()
if face_n.dot(N) < 0: face_n = -face_n
ball_c = Rm @ Vector((0, 0.50, 0)) + face_n * 0.0335
tf = (C - R_) / FPS; vb = (ball_c - rel_p + Vector((0, 0, 0.5 * G * tf * tf))) / tf
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
             "review_fixes": {"direct_arm_lift_blend_frames": [12, TR], "post_contact_roll_removed_frames": [101, nF]}})
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
