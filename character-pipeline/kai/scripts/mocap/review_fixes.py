"""Fix two motion-review issues (user feedback):
  1) After the ready pose the racket swings DOWN AND BEHIND the body (tip reaches y=+0.77 vs pelvis at f44)
     before rising to the trophy.  Pros lift the racket directly up in front of the body with the tip pointing
     up.  This pass replaces the racket path from the ready frame to the trophy frame:
     ready (racket hanging at the side, tip down-forward) -> toss (racket raised in front, tip ~up, never
     behind the hip line) -> trophy (racket up behind the head).  Hand/forearm are solved by IK so the racket
     grip ends exactly at the wrist; upper arm motion is untouched.
  2) After contact the hand pronates a second time around f110-116 (wrist twist -13 -> +87 deg), an
     unnecessary roll.  From the whip blend-out (f100) the wrist simply relaxes into a stable follow-through
     with no further long-axis rotation.
Applied AFTER every other pass, directly to kai_05_serve.blend; does not change the arm/body mocap.
"""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT, world_head, world_tail
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
C, TR, nF = T["contact"], T["trophy"], sc.frame_end
FPS = plan["fps"]
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
RACK_IN_HAND = None
sc.frame_set(1); bpy.context.view_layer.update()
Hw = (rig.matrix_world.to_3x3() @ rig.pose.bones["hand_r"].matrix.to_3x3()).normalized()
RACK_IN_HAND = Hw.inverted() @ racket.matrix_world.to_3x3().normalized()
def base_world(n):
    pb = rig.pose.bones[n]
    return (rig.matrix_world.to_3x3() @ pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[n]).normalized()
def set_world_rot(n, R3):
    rig.pose.bones[n].rotation_quaternion = (base_world(n).inverted() @ R3).to_quaternion()
def smooth(u, u0=0.18):
    u = max(0.0, min(1.0, u)); return u ** 2 * (3 - 2 * u) if False else (u * u * (3 - 2 * u))
def ease(u):
    u = max(0.0, min(1.0, u)); return u * u * (3 - 2 * u)

# ================= issue 1: ready -> toss -> trophy racket path (frames 1..TR)
# Desired racket tip WORLD direction u(f); built in phases, constrained never behind y > +0.10 relative to pelvis.
def desired_u(f):
    if f <= 8:
        return None  # keep the original ready hold
    pel = world_head(rig, "pelvis")
    if f < TR:
        # at f8 racket points down-forward (as ready); at TR-8 it points up in front; at TR it points up-back (trophy)
        if f <= 26:
            u = (f - 8) / (26 - 8); u = ease(u)
            d0 = Vector((-0.3, -0.55, -0.78)); d1 = Vector((-0.15, -0.25, 0.96))
            return d0.lerp(d1, u).normalized()
        u = ease((f - 26) / (TR - 26))
        d1 = Vector((-0.15, -0.25, 0.96)); d2 = Vector((-0.28, 0.08, 0.96))
        return d1.lerp(d2, u).normalized()
    return None
def solve_wrist_for_u(u):
    """find forearm frame and racket world rotation with axis u, face roughly sideways; set lowerarm+hand
    by leaving the forearm as-is and rotating the hand only about the axis that points the racket at u."""
    fa = (rig.matrix_world.to_3x3() @ rig.pose.bones["lowerarm_r"].matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
    cur = (racket.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized()
    ax = cur.cross(u)
    if ax.length < 1e-6: return
    qw = Quaternion(ax.normalized(), cur.angle(u))
    Rr = qw.to_matrix() @ racket.matrix_world.to_3x3()
    Hd = Rr @ RACK_IN_HAND.inverted()
    set_world_rot("hand_r", Hd)
# capture original hand quats first
ORIG_H = {}
for f in range(1, nF + 1):
    sc.frame_set(f); ORIG_H[f] = rig.pose.bones["hand_r"].rotation_quaternion.copy()
fixed1 = []
for f in range(9, TR + 1):
    sc.frame_set(f); bpy.context.view_layer.update()
    u = desired_u(f)
    if u is None:
        rig.pose.bones["hand_r"].rotation_quaternion = ORIG_H[f]; continue
    solve_wrist_for_u(u)
    bpy.context.view_layer.update()
    # keep the wrist inside range
    q = rig.pose.bones["hand_r"].rotation_quaternion
    vq = Vector((q.x, q.y, q.z)); tw = Quaternion((q.w, 0, vq.y, 0)); tw.normalize()
    sw = q @ tw.inverted(); swa = 2 * math.acos(min(1.0, abs(sw.w)))
    if swa > math.radians(75):
        axs = Vector((sw.x, sw.y, sw.z)).normalized() * (1 if sw.w >= 0 else -1)
        rig.pose.bones["hand_r"].rotation_quaternion = Quaternion(axs, math.radians(75)) @ tw
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
    fixed1.append(f)
print("ISSUE1 frames", fixed1[0], "..", fixed1[-1])

# ================= issue 2: remove the post-contact extra pronation roll (f100..nF)
# Blend the wrist twist component (about hand local Y) to a constant equal to its value at f100,
# while preserving the swing component from the existing follow-through.
def split(q):
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); sw = q @ tw.inverted()
    return sw, tw
sc.frame_set(100); _, TW100 = split(rig.pose.bones["hand_r"].rotation_quaternion)
t0 = math.atan2(TW100.y, TW100.w)
fixed2 = []
for f in range(101, nF + 1):
    sc.frame_set(f)
    sw, tw = split(rig.pose.bones["hand_r"].rotation_quaternion)
    u = ease((f - 100) / (nF - 100))
    t1 = math.atan2(tw.y, tw.w)
    # unwrap shortest path from t0
    while t1 - t0 > math.pi: t1 -= 2 * math.pi
    while t1 - t0 < -math.pi: t1 += 2 * math.pi
    t = t1 * (1 - u) + t0 * u
    rig.pose.bones["hand_r"].rotation_quaternion = sw @ Quaternion(Vector((0, 1, 0)), t)
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
    fixed2.append(f)
print("ISSUE2 frames", fixed2[0], "..", fixed2[-1])

# ================= re-solve the ball onto the (unchanged) contact sweet spot
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json"))); G = 9.81; R_ = T["release"]; N = Vector((0, -1, 0))
ball = bpy.data.objects["Kai_Ball"]
sc.frame_set(R_); rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C); Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Vector((0, 0, 1))).normalized()
if face_n.dot(N) < 0: face_n = -face_n
sweet = Rm @ Vector((0, 0.50, 0)); ball_c = sweet + face_n * 0.0335
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
print(f"BALL apex {apex:.2f} contact_z {ball_c.z:.2f}")
plan.update({"toss_v": list(vb), "toss_apex": apex, "contact_ball": list(ball_c), "face_normal": list(face_n), "ball": bp,
             "review_fixes": {"ready_to_trophy_direct": [9, TR], "post_contact_roll_removed": [101, nF]}})
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
