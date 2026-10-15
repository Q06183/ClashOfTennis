"""Racket/hand pass v2 for the mocap serve - anatomical wrist control.

Hand rotation is built ONLY from anatomical wrist angles in the forearm frame (no free world rotation):
  * flexion(+)/extension(-) about the wrist's flexion axis,
  * radial(+)/ulnar(-) deviation,
  * forearm pronation(+)/supination(-) about the forearm axis (split 50/50 forearm twist bone / hand).
Limits enforced: ext <= 70, flex <= 60, rad 20 / uln 35, pron/sup +-85 (+ the shoulder IR seen in the mocap).
The racket is rigid in the hand (continental grip from grip.json), so racket axis & face follow the wrist.
Keys are placed at the events detected from the mocap; a 1-D search over the pronation at contact makes
the racket face square to the net at contact (the target), and over the extension at contact makes the
sweet spot as high as possible (pros hit near full reach)."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from poselib import ROOT, world_head, world_tail
FPS = 60; G = 9.81
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; ball = bpy.data.objects["Kai_Ball"]
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
sc = bpy.context.scene; nF = sc.frame_end; C = T["contact"]; R_ = T["release"]; TR = T["trophy"]
N = Vector((0, -1, 0)); Y = Vector((0, 1, 0))
B = {b.name: b for b in rig.data.bones}
# wrist axes in the HAND bone local frame (rest): flexion axis = palm-normal x hand-axis
hand_rest = B["hand_r"].matrix_local.to_3x3()
mid0 = B["middle_01_r"].head_local; idx0 = B["index_01_r"].head_local; pin0 = B["pinky_01_r"].head_local
lat_w = (idx0 - pin0).normalized()                    # radial direction (toward thumb/index)
palm_w = (B["hand_r"].tail_local - B["hand_r"].head_local).normalized().cross(lat_w).normalized()
tips = B["middle_03_r"].tail_local
if (tips - mid0).dot(palm_w) < 0: palm_w = -palm_w   # palmar side
inv = hand_rest.inverted()
AX_FLEX = (inv @ lat_w).normalized()                  # rotating about the radial axis flexes/extends
AX_DEV = (inv @ palm_w).normalized()                  # rotating about the palm normal = deviation
AX_PRO = Vector((0, 1, 0))                            # bone Y = forearm/hand long axis
def wrist_q(flex, dev, pro):
    return (Quaternion(AX_PRO, math.radians(pro)) @ Quaternion(AX_DEV, math.radians(dev)) @ Quaternion(AX_FLEX, math.radians(flex)))
def sign_check():
    """make +flex move the racket toward the palm (racket head forward when the palm faces forward)"""
    pb = rig.pose.bones["hand_r"]; sc.frame_set(1)
    pb.rotation_quaternion = Quaternion(); bpy.context.view_layer.update()
    t0 = racket.matrix_world @ Vector((0, 0.5, 0))
    pb.rotation_quaternion = Quaternion(AX_FLEX, math.radians(20)); bpy.context.view_layer.update()
    t1 = racket.matrix_world @ Vector((0, 0.5, 0))
    pw = (rig.matrix_world @ rig.pose.bones["hand_r"].matrix).to_3x3() @ (inv @ palm_w)
    return 1.0 if (t1 - t0).dot(pw) > 0 else -1.0
s = sign_check(); AX_FLEX = AX_FLEX * s
print("wrist axes: flex", tuple(round(x, 2) for x in AX_FLEX), "dev", tuple(round(x, 2) for x in AX_DEV))

KEYS = {  # frame: (flex, dev, pron)
    1: (10, -10, 0), (R_ - 12): (5, -30, -35), R_: (0, -25, -30), TR: (-25, -10, -45), C - 5: (-68, 0, -88),
    C: (0, 15, None), C + 6: (45, 10, 88), C + 16: (50, 5, 80), nF: (40, 0, 60)}
def build(pro_c, flex_c):
    k = dict(KEYS); k[C] = (flex_c, 15, pro_c); return sorted(k.items())
TAU = 2.5
def at(keys, f):
    kd = dict(keys); D0, F1 = C - 5, C + 6
    if D0 <= f <= F1 and D0 in kd and F1 in kd and C in kd:
        # whip window: phase s(t) has its max velocity AT contact (tanh), params pass THROUGH the contact
        # pose on a Catmull-Rom curve -> racket angular velocity peaks exactly at contact
        th = lambda x: math.tanh((x - C) / TAU)
        sv = (th(f) - th(D0)) / (th(F1) - th(D0)); sc_ = (0 - th(D0)) / (th(F1) - th(D0))
        A, Bc, Cc = [list(x) for x in (kd[D0], kd[C], kd[F1])]
        out = []
        for a, b, c in zip(A, Bc, Cc):
            if sv <= sc_:
                u = sv / sc_; m0 = 0.0; m1 = (c - a) * sc_
                h = (2*u**3 - 3*u**2 + 1) * a + (u**3 - 2*u**2 + u) * m0 + (-2*u**3 + 3*u**2) * b + (u**3 - u**2) * m1
            else:
                u = (sv - sc_) / (1 - sc_); m0 = (c - a) * (1 - sc_); m1 = 0.0
                h = (2*u**3 - 3*u**2 + 1) * b + (u**3 - 2*u**2 + u) * m0 + (-2*u**3 + 3*u**2) * c + (u**3 - u**2) * m1
            out.append(h)
        return out
    for (fa, a), (fb, b) in zip(keys, keys[1:]):
        if fa <= f <= fb:
            u = (f - fa) / max(1, fb - fa)
            u = u * u * (3 - 2 * u)
            return [x + (y - x) * u for x, y in zip(a, b)]
    return list(keys[-1][1])
def apply(keys, f):
    fl, dv, pr = at(keys, f)
    fl = max(-70, min(60, fl)); dv = max(-35, min(20, dv)); pr = max(-85, min(85, pr))
    rig.pose.bones["hand_r"].rotation_quaternion = wrist_q(fl, dv, pr * 0.5)
    rig.pose.bones["lowerarm_twist_01_r"].rotation_quaternion = Quaternion(AX_PRO, math.radians(pr * 0.5))
    return fl, dv, pr
# twist bone parent is lowerarm_r and the hand's parent is lowerarm_r too -> apply full pronation on the hand
def apply_full(keys, f):
    fl, dv, pr = at(keys, f)
    fl = max(-70, min(60, fl)); dv = max(-35, min(20, dv)); pr = max(-90, min(90, pr))
    rig.pose.bones["hand_r"].rotation_quaternion = wrist_q(fl, dv, pr)
    rig.pose.bones["lowerarm_twist_01_r"].rotation_quaternion = Quaternion(AX_PRO, math.radians(pr * 0.5))
    return fl, dv, pr
# search contact wrist pose (face square, high contact) then whip time-constant (speed & peak at contact)
best = None
sc.frame_set(C)
for pr in range(-30, 31, 3):          # pronation at contact must lie between drop (supinated) and follow-through (pronated)
    for fl in (-25, -15, -5, 0, 5, 15):
        keys = build(pr, fl); apply_full(keys, C); bpy.context.view_layer.update()
        n = (racket.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
        sq = abs(n.dot(N)); h = (racket.matrix_world @ Vector((0, 0.5, 0))).z
        ahead = (racket.matrix_world @ Vector((0, 0.5, 0)) - world_head(rig, "pelvis")).dot(N)
        score = sq * 3 + h * 1.0 + max(0, ahead) * 0.5 - abs(pr) * 0.004
        if best is None or score > best[0]: best = (score, pr, fl, sq, h, ahead)
_, PRC, FLC, sq, h, ahead = best
print(f"CONTACT wrist: pron={PRC} flex={FLC} -> face·net={sq:.2f} sweet_z={h:.2f} ahead={ahead:.2f} m")
def sweet_speed(keys, f):
    sc.frame_set(f - 1); apply_full(keys, f - 1); bpy.context.view_layer.update(); a = racket.matrix_world @ Vector((0, 0.5, 0))
    sc.frame_set(f); apply_full(keys, f); bpy.context.view_layer.update(); b = racket.matrix_world @ Vector((0, 0.5, 0))
    return (b - a).length * FPS
bestT = None
for tau in (1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5):
    TAU = tau; keys = build(PRC, FLC)
    sp = {f: sweet_speed(keys, f) for f in range(C - 6, C + 7)}
    pk = max(sp, key=sp.get)
    sc_ = abs(sp[C] - 41) + abs(pk - C) * 6
    print(f"  tau={tau}: v@C={sp[C]:.1f} peak={pk} ({sp[pk]:.1f})")
    if bestT is None or sc_ < bestT[0]: bestT = (sc_, tau)
TAU = bestT[1]; print("WHIP tau", TAU)
KEYSF = build(PRC, FLC)
for f in range(1, nF + 1):
    sc.frame_set(f); apply_full(KEYSF, f); bpy.context.view_layer.update()
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
    rig.pose.bones["lowerarm_twist_01_r"].keyframe_insert("rotation_quaternion", frame=f)
# ---- clearance pass: push the racket out of the leg/trunk where it intersects (only adds ulnar/outward deviation)
import bmesh
from mathutils.bvhtree import BVHTree
body = bpy.data.objects["Kai_Body"]; shorts = bpy.data.objects.get("Kai_Shorts")
def inside_count():
    dg = bpy.context.evaluated_depsgraph_get(); bm = bmesh.new()
    for o in [body] + ([shorts] if shorts else []):
        ev = o.evaluated_get(dg); m = ev.to_mesh(); t = bmesh.new(); t.from_mesh(m); t.transform(ev.matrix_world)
        tm = bpy.data.meshes.new("_t"); t.to_mesh(tm); bm.from_mesh(tm); bpy.data.meshes.remove(tm); t.free(); ev.to_mesh_clear()
    tree = BVHTree.FromBMesh(bm); rk = racket.evaluated_get(dg); rm = rk.to_mesh(); n = 0
    for i, v in enumerate(rm.vertices):
        if i % 4: continue
        pp = rk.matrix_world @ v.co
        if (racket.matrix_world.inverted() @ pp).y < 0.20: continue
        loc, nrm, idx, dist = tree.find_nearest(pp)
        if loc is not None and dist < 0.04 and (pp - loc).dot(nrm) < 0.01: n += 1
    rk.to_mesh_clear(); bm.free(); return n
fixed = []
for f in range(1, T["trophy"]):
    sc.frame_set(f)
    if inside_count() == 0: continue
    fl, dv, pr = at(KEYSF, f)
    for extra in range(5, 60, 5):
        rig.pose.bones["hand_r"].rotation_quaternion = wrist_q(fl, max(-35, dv - extra), pr - extra * 0.5)
        bpy.context.view_layer.update()
        if inside_count() == 0: break
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f); fixed.append((f, extra))
print("CLEARANCE fixed frames", fixed)
# smooth the fixed segment (3-tap on quaternion keys) so the correction does not pop
if fixed:
    fr = sorted({f for f, _ in fixed}); lo, hi = max(1, fr[0] - 4), min(nF, fr[-1] + 4)
    Q = {}
    for f in range(lo, hi + 1):
        sc.frame_set(f); Q[f] = rig.pose.bones["hand_r"].rotation_quaternion.copy()
    for f in range(lo + 1, hi):
        a, b, c = Q[f - 1], Q[f], Q[f + 1]
        if a.dot(b) < 0: a = -a
        if c.dot(b) < 0: c = -c
        q = Quaternion(((a.w + 2 * b.w + c.w), (a.x + 2 * b.x + c.x), (a.y + 2 * b.y + c.y), (a.z + 2 * b.z + c.z))).normalized()
        sc.frame_set(f); rig.pose.bones["hand_r"].rotation_quaternion = q; rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
    left = []
    for f in range(lo, hi + 1):
        sc.frame_set(f)
        if inside_count(): left.append(f)
    print("CLEARANCE remaining after smoothing", left)
sp = {}; prev = None
for f in range(1, nF + 1):
    sc.frame_set(f); p = racket.matrix_world @ Vector((0, 0.5, 0))
    if prev is not None: sp[f] = (p - prev).length * FPS
    prev = p
pk = max(range(C - 10, C + 6), key=lambda f: sp[f])
print("RACKET speed", [(f, round(sp[f], 1)) for f in range(C - 8, C + 5)], "peak", pk)
# ball
sc.frame_set(R_); rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C); Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Vector((0, 0, 1))).normalized()
if face_n.dot(N) < 0: face_n = -face_n
sweet = Rm @ Vector((0, 0.50, 0)); ball_c = sweet + face_n * 0.0335
tf = (C - R_) / FPS; vb = (ball_c - rel_p + Vector((0, 0, 0.5 * G * tf * tf))) / tf
apex = rel_p.z + max(0, vb.z) ** 2 / (2 * G)
print(f"BALL contact_z={ball_c.z:.2f} face·net={face_n.dot(N):.2f} toss_vz={vb.z:.2f} apex={apex:.2f} apex_before={tf - vb.z / G:.2f}s")
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
             "wrist_keys": [[k, list(v)] for k, v in KEYSF]})
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
