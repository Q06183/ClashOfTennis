"""Whip pass: racket release around contact, expressed in the FOREARM frame.

Mocap gives arm segment directions but not humeral internal rotation / wrist snap, which is where most of
the racket-head speed comes from (Elliott 1995: IR + wrist flexion ~ 70% of racket speed).  In the window
[C-W0, C+W1] the racket rotation relative to the forearm is driven from its pre-window orientation (racket
drop, lagging behind) to a contact orientation (racket almost in line with the arm, slightly forward, face
square to the net) with a phase s(t) = tanh law whose rate peaks EXACTLY at contact and continues through
(follow-through = racket passes the arm).  It is blended back into the anatomical keys after the window.
Wrist swing is limited to 85 deg from the forearm axis at every frame (reported)."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from poselib import ROOT, world_head, world_tail
FPS = 60; G = 9.81
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; ball = bpy.data.objects["Kai_Ball"]
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
sc = bpy.context.scene; nF = sc.frame_end; C = T["contact"]; R_ = T["release"]
N = Vector((0, -1, 0)); Z = Vector((0, 0, 1))
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
W0, W1, BL = 6, 14, 6       # window before / after contact, blend-out length
sc.frame_set(1); bpy.context.view_layer.update()
RACK_IN_HAND = (rig.matrix_world.to_3x3() @ rig.pose.bones["hand_r"].matrix.to_3x3()).inverted() @ racket.matrix_world.to_3x3()
def FA(f):
    sc.frame_set(f); return (rig.matrix_world.to_3x3() @ rig.pose.bones["lowerarm_r"].matrix.to_3x3()).normalized()
def RW(f):
    sc.frame_set(f); return racket.matrix_world.to_3x3().normalized()
orig_q = {}
for f in range(1, nF + 1):
    sc.frame_set(f); orig_q[f] = rig.pose.bones["hand_r"].rotation_quaternion.copy()
# start orientation (forearm-local) at the window start
fs, fe = C - W0, min(nF, C + W1)
L0 = (FA(fs).inverted() @ RW(fs)).to_quaternion()
def contact_world(lean_fwd_deg):
    fa = FA(C); fdir = (fa @ Vector((0, 1, 0))).normalized()
    u = (Quaternion(fdir.cross(N).normalized() if fdir.cross(N).length > 1e-6 else Vector((1, 0, 0)), math.radians(lean_fwd_deg)) @ fdir).normalized()
    n = (N - u * N.dot(u)).normalized()
    X = u.cross(n).normalized()
    return Matrix((X, u, n)).transposed()
def solve(tau, lean, s_max):
    LC = (FA(C).inverted() @ contact_world(lean)).to_quaternion()
    if L0.dot(LC) < 0: LCq = -LC
    else: LCq = LC
    th = lambda x: math.tanh((x - C) / tau)
    out = {}
    for f in range(fs, fe + 1):
        s = (th(f) - th(fs)) / (th(C) - th(fs))          # 0 at fs, 1 at C, keeps growing after C
        s = min(s, s_max)
        # quaternion power for extrapolation beyond 1
        d = L0.inverted() @ LCq
        ang = 2 * math.acos(max(-1, min(1, d.w))); ax = Vector((d.x, d.y, d.z))
        dq = Quaternion(ax.normalized(), ang * s) if ax.length > 1e-9 else Quaternion()
        out[f] = L0 @ dq
    return out
def apply_frames(Lq, write=False):
    sw_max = 0; sp = {}; prev = None
    for f in range(fs, fe + 1):
        sc.frame_set(f)
        Rr = FA(f) @ Lq[f].to_matrix()
        Hd = Rr @ RACK_IN_HAND.inverted()
        pbF = rig.pose.bones["lowerarm_r"]
        baseH = (rig.matrix_world.to_3x3() @ pbF.matrix.to_3x3()) @ REST["lowerarm_r"].inverted() @ REST["hand_r"]
        q = (baseH.inverted() @ Hd).to_quaternion()
        # swing limit (angle between hand axis and forearm axis)
        vq = Vector((q.x, q.y, q.z)); tw = Quaternion((q.w, 0, vq.y, 0)); tw = tw.normalized() if tw.magnitude > 1e-9 else Quaternion()
        swq = q @ tw.inverted(); sw = 2 * math.acos(min(1.0, abs(swq.w)))
        if sw > math.radians(85):
            ax = Vector((swq.x, swq.y, swq.z)).normalized() * (1 if swq.w >= 0 else -1)
            q = Quaternion(ax, math.radians(85)) @ tw
        sw_max = max(sw_max, math.degrees(sw))
        # pronation share: half of the long-axis twist goes to the forearm twist bone (no candy-wrapper wrist)
        vq2 = Vector((q.x, q.y, q.z)); tw2 = Quaternion((q.w, 0, vq2.y, 0)); tw2 = tw2.normalized() if tw2.magnitude > 1e-9 else Quaternion()
        ta = 2 * math.atan2(tw2.y, tw2.w); ta = (ta + math.pi) % (2 * math.pi) - math.pi
        rig.pose.bones["lowerarm_twist_01_r"].rotation_quaternion = Quaternion(Vector((0, 1, 0)), ta * 0.5)
        rig.pose.bones["hand_r"].rotation_quaternion = q; bpy.context.view_layer.update()
        p = racket.matrix_world @ Vector((0, 0.5, 0))
        if prev is not None: sp[f] = (p - prev).length * FPS
        prev = p
        if write:
            rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f); rig.pose.bones["lowerarm_twist_01_r"].keyframe_insert("rotation_quaternion", frame=f)
    return sw_max, sp
best = None
for tau in (0.6, 0.8, 1.0, 1.25, 1.5):
    for lean in (0, 5, 15, 25):
        for smax in (1.3, 1.6, 2.0, 2.5, 3.0):
            Lq = solve(tau, lean, smax); swm, sp = apply_frames(Lq)
            pk = max(sp, key=sp.get); vpk = max(sp.get(C, 0), sp.get(C + 1, 0))
            score = abs(vpk - 41) + (8 if vpk < 36 else 0) + (0 if C <= pk <= C + 1 else 20) + max(0, swm - 80) * 2
            if best is None or score < best[0]: best = (score, tau, lean, smax, vpk, pk, swm)
for f in range(fs, fe + 1):
    sc.frame_set(f); rig.pose.bones["hand_r"].rotation_quaternion = orig_q[f]
_, TAU, LEAN, SMAX, vC, pk, swm = best
print(f"WHIP tau={TAU} lean={LEAN} smax={SMAX} v@C={vC:.1f} m/s peak={pk} wrist_swing_max={swm:.0f} deg")
Lq = solve(TAU, LEAN, SMAX); apply_frames(Lq, write=True)
# blend-out back to the anatomical follow-through keys
qe = None
sc.frame_set(fe); qe = rig.pose.bones["hand_r"].rotation_quaternion.copy()
for i, f in enumerate(range(fe + 1, min(nF, fe + BL) + 1)):
    u = (i + 1) / (BL + 1); u = u * u * (3 - 2 * u)
    a = qe if qe.dot(orig_q[f]) >= 0 else -qe
    sc.frame_set(f); rig.pose.bones["hand_r"].rotation_quaternion = a.slerp(orig_q[f], u)
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
# speed report
sp = {}; prev = None
for f in range(C - 12, C + 12):
    sc.frame_set(f); p = racket.matrix_world @ Vector((0, 0.5, 0))
    if prev is not None: sp[f] = (p - prev).length * FPS
    prev = p
print("RACKET speed", [(f, round(v, 1)) for f, v in sp.items()])
# ball re-solve
sc.frame_set(R_); rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C); Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Vector((0, 0, 1))).normalized()
if face_n.dot(N) < 0: face_n = -face_n
sweet = Rm @ Vector((0, 0.50, 0)); ball_c = sweet + face_n * 0.0335
tf = (C - R_) / FPS; vb = (ball_c - rel_p + Vector((0, 0, 0.5 * G * tf * tf))) / tf
apex = rel_p.z + max(0, vb.z) ** 2 / (2 * G)
print(f"BALL contact_z={ball_c.z:.2f} face·net={face_n.dot(N):.2f} toss_vz={vb.z:.2f} apex={apex:.2f} apex_before={tf - vb.z / G:.2f}s toss_horiz={math.hypot(vb.x, vb.y):.2f}")
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
             "whip": {"tau": TAU, "lean": LEAN, "smax": SMAX, "v_contact": vC, "wrist_swing_max": swm}})
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
