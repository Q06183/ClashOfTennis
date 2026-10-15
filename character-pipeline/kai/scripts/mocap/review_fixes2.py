"""Fix two motion-review issues by DRIVING the racket pose in WORLD space, then solving wrist + forearm.

Issue 1 (frames 9..trophy): racket used to swing down and behind the body.  New path keeps the racket in front
of the torso (tip never behind the shoulder line), raises it straight up to the trophy, then releases to the
original trophy pose.
Issue 2 (frames 101..end): the wrist used to pronate a second time.  Long-axis twist is held constant; only the
swing needed for the follow-through remains.
"""
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
sc.frame_set(1); bpy.context.view_layer.update()
RACK_IN_HAND = (W3("hand_r").inverted() @ racket.matrix_world.to_3x3().normalized()).normalized()
def ease(u): u = max(0.0, min(1.0, u)); return u * u * (3 - 2 * u)
def racket_frame(u, face):
    u = u.normalized(); face = (face - u * face.dot(u)).normalized()
    x = u.cross(face).normalized()
    return Matrix((x, u, face)).transposed()
def clamp_wrist():
    q = rig.pose.bones["hand_r"].rotation_quaternion
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); sw = q @ tw.inverted()
    a = 2 * math.acos(min(1.0, abs(sw.w)))
    if a > math.radians(80):
        axs = Vector((sw.x, sw.y, sw.z)).normalized() * (1 if sw.w >= 0 else -1)
        rig.pose.bones["hand_r"].rotation_quaternion = Quaternion(axs, math.radians(80)) @ tw
def apply_racket_world(Rr, u=None):
    Rf0 = W3("lowerarm_r").copy()
    setw("hand_r", Rr @ RACK_IN_HAND.inverted()); bpy.context.view_layer.update()
    grip = racket.matrix_world.translation
    elbow = (rig.matrix_world @ rig.pose.bones["lowerarm_r"].matrix).translation
    wrist = (rig.matrix_world @ rig.pose.bones["hand_r"].matrix).translation
    # allowable grip-wrist gap: the racket parent has a small offset and the forearm must stay natural.
    # Correct only large gaps, and never let the bend swing the tip backwards.
    if (grip - wrist).length > 0.04:
        fa = (wrist - elbow).normalized(); tgt = (grip - elbow).normalized(); ax = fa.cross(tgt)
        if ax.length > 1e-6:
            ang = min(fa.angle(tgt), math.radians(20))
            setw("lowerarm_r", Quaternion(ax.normalized(), ang).to_matrix() @ W3("lowerarm_r"))
            bpy.context.view_layer.update()
            setw("hand_r", Rr @ RACK_IN_HAND.inverted()); bpy.context.view_layer.update()
            u2 = (racket.matrix_world.to_3x3() @ Y).normalized()
            if u is not None and u2.dot(u) < 0.985:
                setw("lowerarm_r", Rf0); bpy.context.view_layer.update()
                setw("hand_r", Rr @ RACK_IN_HAND.inverted()); bpy.context.view_layer.update()
    clamp_wrist()
# issue 1: world-space racket path 9..TR
sc.frame_set(8); R0 = racket.matrix_world.to_3x3().normalized(); u0 = R0 @ Y; f0 = R0 @ Z
sc.frame_set(TR); RT = racket.matrix_world.to_3x3().normalized(); uT = RT @ Y; fT = RT @ Z
def path_frame(f):
    if f <= 8 or f > TR: return None
    if 9 <= f <= 30:
        u = ease((f - 8) / (30 - 8))
        ua = u0.lerp(Vector((-0.12, -0.55, 0.82)), u).normalized()
        face = f0.lerp(Vector((-0.88, -0.4, 0.0)), 0.6 * u).normalized()
        return racket_frame(ua, face)
    # 30..TR: stay in FRONT of the shoulder line the whole time; only blend toward the trophy in the last 10 frames
    if f < TR - 10:
        ua = Vector((-0.12, -0.55, 0.82))
        face = Vector((-0.82, -0.5, 0.0))
        return racket_frame(ua, face)
    u = ease((f - (TR - 10)) / 10)
    ua = Vector((-0.12, -0.55, 0.82)).lerp(uT, u).normalized()
    face = Vector((-0.82, -0.5, 0.0)).lerp(fT, u).normalized()
    return racket_frame(ua, face)
n1 = 0
for f in range(9, TR + 1):
    sc.frame_set(f); Rr = path_frame(f)
    if Rr is None: continue
    apply_racket_world(Rr, ua if 'ua' in dir() else None)
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
    rig.pose.bones["lowerarm_r"].keyframe_insert("rotation_quaternion", frame=f)
    n1 += 1
worst = 0.0
for f in range(9, TR + 1):
    sc.frame_set(f); worst = max(worst, (racket.matrix_world @ Vector((0, 0.6, 0)) - world_head(rig, "clavicle_r")).y)
print("ISSUE1 edited frames", n1, "tip max behind shoulder y =", round(worst, 3), "m")
# issue 2: freeze long-axis twist from f100
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
print("ISSUE2 edited frames 101..", nF)
# ball
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
             "review_fixes": {"direct_racket_lift_frames": [9, TR], "post_contact_roll_removed_frames": [101, nF]}})
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
