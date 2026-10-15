"""Arm cleanup (review round 3).  Starts from kai_05_serve_prereview.blend (all earlier passes, before review edits).

1) Direct lift ready -> trophy WITHOUT overshoot (frames 12..trophy):
   upper arm is interpolated in the TRUNK frame (spine_03), forearm in the upper-arm frame, hand in the forearm
   frame, each by a single slerp from the ready pose (f12) to the original mocap trophy pose.  The arm therefore
   rises monotonically and never goes higher than the trophy itself; the racket comes up in front/side, not behind.
2) Twist continuity (whole clip): upper arm and forearm keep their exact mocap DIRECTIONS, but their roll about the
   bone axis is rebuilt by parallel transport and Gaussian-smoothed (sigma 2 frames).  This removes the hinge-flip
   pops (e.g. 72 deg in one frame at f98) that happen when the elbow is almost straight.  Hand world orientation
   is restored afterwards so the racket is unaffected.
3) Contact window: the racket used to rotate 104 deg in the single frame before contact.  The hand orientation is
   re-timed along the SAME path (same contact pose at the contact frame) with a bell-shaped angular-velocity
   profile peaking at contact, so the snap is spread over several frames.
4) After contact the wrist long-axis twist is held constant from f100 (no second pronation).
5) Twist bones are recomputed from the final poses with angle unwrapping (fixes a 40 deg/frame wrap at f38).
"""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT, world_head, world_tail
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve_prereview.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
C, TR, nF, FPS = T["contact"], T["trophy"], sc.frame_end, plan["fps"]
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
Y = Vector((0, 1, 0))
F0 = 12
def Wq(n): return (rig.matrix_world.to_3x3() @ rig.pose.bones[n].matrix.to_3x3()).normalized().to_quaternion()
def base3(n):
    pb = rig.pose.bones[n]
    return (rig.matrix_world.to_3x3() @ pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[n]).normalized()
def setwq(n, q):
    rig.pose.bones[n].rotation_quaternion = (base3(n).inverted() @ q.to_matrix()).to_quaternion()
    bpy.context.view_layer.update()
def key(n, f): rig.pose.bones[n].keyframe_insert("rotation_quaternion", frame=f)
def ease(u): u = max(0.0, min(1.0, u)); return u * u * (3 - 2 * u)
def slerp(a, b, t):
    if a.dot(b) < 0: b = -b
    return a.slerp(b, t)
ARM = ["upperarm_r", "lowerarm_r", "hand_r"]

# ---------- 1) direct lift (trunk-relative interpolation, no overshoot)
def rel(parent_q, child_q): return parent_q.inverted() @ child_q
sc.frame_set(F0)
r0 = {"upperarm_r": rel(Wq("spine_03"), Wq("upperarm_r")), "lowerarm_r": rel(Wq("upperarm_r"), Wq("lowerarm_r")),
      "hand_r": rel(Wq("lowerarm_r"), Wq("hand_r"))}
sc.frame_set(TR)
r1 = {"upperarm_r": rel(Wq("spine_03"), Wq("upperarm_r")), "lowerarm_r": rel(Wq("upperarm_r"), Wq("lowerarm_r")),
      "hand_r": rel(Wq("lowerarm_r"), Wq("hand_r"))}
for f in range(F0 + 1, TR):
    sc.frame_set(f)
    p = ease((f - F0) / (TR - F0))
    setwq("upperarm_r", Wq("spine_03") @ slerp(r0["upperarm_r"], r1["upperarm_r"], p))
    setwq("lowerarm_r", Wq("upperarm_r") @ slerp(r0["lowerarm_r"], r1["lowerarm_r"], p))
    setwq("hand_r", Wq("lowerarm_r") @ slerp(r0["hand_r"], r1["hand_r"], p))
    for n in ARM: key(n, f)
mx_abd = 0; mx_wz = 0
for f in range(F0, TR + 1):
    sc.frame_set(f)
    sh, el, wr = world_head(rig, "upperarm_r"), world_head(rig, "lowerarm_r"), world_tail(rig, "lowerarm_r")
    down = -(world_head(rig, "neck_01") - world_head(rig, "pelvis")).normalized()
    mx_abd = max(mx_abd, math.degrees((el - sh).angle(down))); mx_wz = max(mx_wz, wr.z)
print(f"LIFT frames {F0}..{TR}: max upper-arm elevation {mx_abd:.0f} deg, max wrist height {mx_wz:.2f} m")

# ---------- 2) twist continuity for upper arm and forearm (directions exact, roll smoothed)
def twist_smooth(n, sigma=2.0):
    Q = {}; D = {}
    for f in range(1, nF + 1):
        sc.frame_set(f); Q[f] = Wq(n); D[f] = (Q[f] @ Y).normalized()
    # incremental roll of the original vs parallel transport of the previous original
    inc = {1: 0.0}
    for f in range(2, nF + 1):
        Pt = D[f - 1].rotation_difference(D[f]) @ Q[f - 1]
        d = Pt.inverted() @ Q[f]                           # residual, should be (mostly) about local Y
        tw = Quaternion((d.w, 0, d.y, 0)); tw.normalize()
        a = 2 * math.atan2(tw.y, tw.w); a = (a + math.pi) % (2 * math.pi) - math.pi
        inc[f] = a
    cum = {1: 0.0}
    for f in range(2, nF + 1): cum[f] = cum[f - 1] + inc[f]
    sm = {}
    for f in range(1, nF + 1):
        num = den = 0.0
        for g in range(max(1, f - 8), min(nF, f + 8) + 1):
            w = math.exp(-((f - g) ** 2) / (2 * sigma * sigma)); num += cum[g] * w; den += w
        sm[f] = num / den
    out = {1: Q[1] @ Quaternion(Y, sm[1] - cum[1])}
    for f in range(2, nF + 1):
        Pt = D[f - 1].rotation_difference(D[f]) @ out[f - 1]
        out[f] = Pt @ Quaternion(Y, sm[f] - sm[f - 1])
    big = [(f, round(math.degrees(inc[f]))) for f in range(2, nF + 1) if abs(inc[f]) > math.radians(20)]
    return out, big
for n in ("upperarm_r", "lowerarm_r"):
    keep_child = {}
    for f in range(1, nF + 1):
        sc.frame_set(f); keep_child[f] = {c: Wq(c) for c in ARM[ARM.index(n) + 1:]}
    newq, big = twist_smooth(n)
    for f in range(1, nF + 1):
        sc.frame_set(f); setwq(n, newq[f])
        for c, q in keep_child[f].items(): setwq(c, q)
        key(n, f)
        for c in keep_child[f]: key(c, f)
    print(f"TWIST {n}: original roll jumps > 20 deg/frame at {big}")

# ---------- 3) contact-window re-timing of the hand along its own path
W0, W1 = C - 8, C + 8
H = {}
for f in range(W0, W1 + 1):
    sc.frame_set(f); H[f] = rel(Wq("lowerarm_r"), Wq("hand_r"))
steps = {f: math.radians(0) for f in range(W0, W1 + 1)}
for f in range(W0 + 1, W1 + 1):
    a, b = H[f - 1], H[f]
    if a.dot(b) < 0: b = -b
    steps[f] = a.rotation_difference(b).angle
s = {W0: 0.0}
for f in range(W0 + 1, W1 + 1): s[f] = s[f - 1] + steps[f]
S_C, S_T = s[C], s[W1]
def profile(sig1, sig2):
    g = lambda t, sg: math.exp(-(t * t) / (2 * sg * sg))
    a1 = sum(g(f - C, sig1) for f in range(W0 + 1, C + 1)); a2 = sum(g(f - C, sig2) for f in range(C + 1, W1 + 1))
    A1, A2 = S_C / a1, (S_T - S_C) / a2
    return A1, A2, g
best = None
for s1 in [x / 4 for x in range(4, 25)]:
    for s2 in [x / 4 for x in range(4, 25)]:
        A1, A2, g = profile(s1, s2)
        err = abs(A1 - A2 * g(1, s2) / 1.0) + 0.02 * (A1 + A2)
        if best is None or err < best[0]: best = (err, s1, s2, A1, A2)
_, s1, s2, A1, A2 = best
g = lambda t, sg: math.exp(-(t * t) / (2 * sg * sg))
snew = {W0: 0.0}
for f in range(W0 + 1, W1 + 1):
    snew[f] = snew[f - 1] + (A1 * g(f - C, s1) if f <= C else A2 * g(f - C, s2))
def at_arclen(x):
    for f in range(W0 + 1, W1 + 1):
        if s[f] >= x - 1e-9:
            seg = s[f] - s[f - 1]
            t = 0.0 if seg < 1e-9 else (x - s[f - 1]) / seg
            return slerp(H[f - 1], H[f], max(0.0, min(1.0, t)))
    return H[W1]
for f in range(W0 + 1, W1):
    sc.frame_set(f); setwq("hand_r", Wq("lowerarm_r") @ at_arclen(snew[f])); key("hand_r", f)
print(f"CONTACT re-time: hand max step before {math.degrees(max(steps.values())):.0f} deg/frame -> after "
      f"{math.degrees(max(A1, A2)):.0f} deg/frame (sigma {s1}/{s2} frames)")

# ---------- 4) freeze wrist long-axis twist after f100
def parts(q):
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); return q @ tw.inverted(), tw
sc.frame_set(100); _, TW0 = parts(rig.pose.bones["hand_r"].rotation_quaternion)
for f in range(101, nF + 1):
    sc.frame_set(f); sw, _ = parts(rig.pose.bones["hand_r"].rotation_quaternion)
    rig.pose.bones["hand_r"].rotation_quaternion = sw @ TW0; key("hand_r", f)

# ---------- 5) twist bones from final poses (unwrapped)
def local_twist_series(n):
    out = {}; prev = None
    for f in range(1, nF + 1):
        sc.frame_set(f); q = rig.pose.bones[n].rotation_quaternion
        tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); a = 2 * math.atan2(tw.y, tw.w)
        if prev is not None:
            while a - prev > math.pi: a -= 2 * math.pi
            while a - prev < -math.pi: a += 2 * math.pi
        out[f] = a; prev = a
    return out
K_UP = json.load(open(os.path.join(ROOT, "qa", "twist_distribution.json")))["upperarm_twist_counter_K"]
for s_ in ("l", "r"):
    tws = local_twist_series("upperarm_" + s_)
    for f in range(1, nF + 1):
        sc.frame_set(f); pb = rig.pose.bones["upperarm_twist_01_" + s_]
        pb.rotation_quaternion = Quaternion(Y, -K_UP * tws[f]); key("upperarm_twist_01_" + s_, f)
twh = local_twist_series("hand_r")
for f in range(1, nF + 1):
    sc.frame_set(f); rig.pose.bones["lowerarm_twist_01_r"].rotation_quaternion = Quaternion(Y, 0.5 * twh[f]); key("lowerarm_twist_01_r", f)

# ---------- audit: per-frame world rotation of the arm chain
names = ["upperarm_r", "upperarm_twist_01_r", "lowerarm_r", "lowerarm_twist_01_r", "hand_r"]
prev = None; worst = {n: (0, 0) for n in names}
for f in range(1, nF + 1):
    sc.frame_set(f); Wn = {n: Wq(n) for n in names}
    if prev:
        for n in names:
            a = prev[n]; b = Wn[n]
            if a.dot(b) < 0: b = -b
            d = math.degrees(a.rotation_difference(b).angle)
            if d > worst[n][0]: worst[n] = (round(d, 1), f)
    prev = Wn
print("AUDIT max per-frame rotation (deg, frame):", worst)

# ---------- ball re-solve (contact pose unchanged, but keep everything consistent)
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json"))); G = 9.81; R_ = T["release"]; N = Vector((0, -1, 0))
ball = bpy.data.objects["Kai_Ball"]
sc.frame_set(R_); rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C); Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Vector((0, 0, 1))).normalized()
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
print(f"BALL contact_z={ball_c.z:.2f} face_net={face_n.dot(N):.3f} apex={apex:.2f}")
plan.update({"toss_v": list(vb), "toss_apex": apex, "contact_ball": list(ball_c), "face_normal": list(face_n), "ball": bp,
             "review_fixes": {"direct_lift_trunk_relative": [F0, TR], "twist_continuity": "upperarm_r, lowerarm_r",
                              "contact_hand_retime": [W0, W1], "post_contact_twist_frozen_from": 100}})
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
