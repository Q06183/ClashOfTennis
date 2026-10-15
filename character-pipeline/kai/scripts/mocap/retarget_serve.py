"""Step 6 (v3): REAL motion-capture serve retargeted onto Kai.

Source  : Tennis-MoCap (Pulgarin-Giraldo et al. 2017, CC BY-SA 3.0), player "jarua" - high-performance,
          male, right-handed; serve #3 of the take (contact = right-wrist height peak, frame 1113, 100 Hz).
Retarget:
  * limbs (upper/lower arm, thigh, calf): Kai bone axis = source segment direction (exact), minimal twist;
  * pelvis / spine / neck / head / feet: the source segment frame's rotation relative to UPRIGHT
    (up axis + lateral hip/shoulder line) is applied to Kai's own rest frame -> keeps Kai's spine curve;
  * root: horizontal = scaled source hips path; vertical = solved every frame so Kai's lowest sole point
    has the same ground clearance as the source's feet (jump height & planted feet preserved);
  * racket: rigid in the right hand, but the racket axis is a PHYSICAL ROD driven by the wrist:
    I*dw/dt = m*Lcm*(u x g_eff) + k*(u x d) - c*w, g_eff = g - a_grip (hand acceleration from the mocap).
    This produces the real racket drop (lag) and whip into contact; face rotation (pronation) follows
    the long-axis-rotation pattern (edge-on -> square at contact -> pronated after);
  * ball: released from the left hand when its upward velocity falls past its peak; ballistic to contact.
Output: kai_05_serve.blend (+ qa/serve_plan.json) so the existing contact solver and physics QA run unchanged."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from poselib import ROOT, reset, world_head, world_tail
from bvh_tools import parse_bvh, fk, DATA

SRC = "jarua_Servicio.bvh"; C_SRC = 1113; PRE, POST = 1.55, 0.95
FPS = 60; G = 9.81
J, F, dt = parse_bvh(os.path.join(DATA, SRC))
f0, f1 = C_SRC - int(round(PRE / dt)), C_SRC + int(round(POST / dt))
SRCW = [fk(J, F[i]) for i in range(f0, f1 + 1)]
def V(p): return Vector((p[0], p[1], p[2]))

# ---------------- source (BVH: Y-up, cm) -> Blender (Z-up, m, serve travel -> -Y, right hand on -X side)
travel = V(SRCW[-1]["Hips"][0]) - V(SRCW[0]["Hips"][0]); travel.y = 0; fwd_src = travel.normalized()
up_src = Vector((0, 1, 0)); side_src = fwd_src.cross(up_src).normalized()
def build_R(sign):
    Ms = Matrix((side_src, up_src, fwd_src)).transposed()
    Md = Matrix((Vector((sign, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)))).transposed()
    return Md @ Ms.inverted()
R_SD = build_R(-1.0)
iC = int(round(PRE / dt))
wc = SRCW[iC]
if (R_SD @ (V(wc["RightShoulder"][0]) - V(wc["LeftShoulder"][0]))).x > 0 or R_SD.determinant() < 0:
    R_SD = build_R(1.0)
assert abs(R_SD.determinant() - 1) < 1e-6, R_SD.determinant()
origin = V(SRCW[0]["Hips"][0]); origin.y = 0
def P(w, n): return R_SD @ ((V(w[n][0]) - origin) * 0.01)        # source joint, Blender coords, metres

# source height & scale
src_h = max(w["Head_End"][0][1] for w in SRCW[:40]) * 0.01
# ground offsets of the source markers (toe marker sits on the shoe)
toe_floor = sorted(min(w["LeftAnkle_End"][0][1], w["RightAnkle_End"][0][1]) for w in SRCW)[len(SRCW) // 20] * 0.01
ank_floor = sorted(min(w["LeftAnkle"][0][1], w["RightAnkle"][0][1]) for w in SRCW)[len(SRCW) // 20] * 0.01
def src_clear(w):
    c = []
    for s in ("Left", "Right"):
        c.append(max(0.0, min(w[s + "Ankle_End"][0][1] * 0.01 - toe_floor, w[s + "Ankle"][0][1] * 0.01 - ank_floor)))
    return min(c), c

# ---------------- Kai
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; ball = bpy.data.objects["Kai_Ball"]
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
sc = bpy.context.scene; sc.render.fps = FPS
for o in [o for o in bpy.data.objects if o.animation_data]: o.animation_data_clear()
reset(rig)
B = {b.name: b for b in rig.data.bones}
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
kai_h = 1.865
S = kai_h / src_h
print("SOURCE height", round(src_h, 3), "m -> scale", round(S, 3), "| floors toe", round(toe_floor, 3), "ankle", round(ank_floor, 3))

def base3(n):
    pb = rig.pose.bones[n]
    return (pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[n]) if pb.parent else REST[n]
def set_world3(n, R3):
    rig.pose.bones[n].rotation_quaternion = (base3(n).inverted() @ R3).to_quaternion()
def frame(up, lat):
    u = up.normalized(); l = (lat - lat.dot(u) * u).normalized()
    return Matrix((l, u.cross(l) * -1 * -1, u)).transposed() if False else Matrix((l, l.cross(u) * -1, u)).transposed()
UPRIGHT = frame(Vector((0, 0, 1)), Vector((1, 0, 0)))   # Kai rest: up +Z, character's left +X
def apply_frame_delta(n, up, lat):
    Q = frame(up, lat) @ UPRIGHT.inverted()
    set_world3(n, Q @ REST[n])
def aim(n, d):
    b = base3(n); cur = (b @ Vector((0, 1, 0))).normalized()
    set_world3(n, cur.rotation_difference(d.normalized()).to_matrix() @ b)


HINGE_PREV = {}
def aim_hinge(nu, nl, du, dl, flex_dir):
    """upper bone twist from the joint's bend plane (elbow/knee are hinges): rest hinge axis
    h0 = a0 x flex_dir (flexion moves the distal segment toward flex_dir in the rest pose);
    posed hinge h = du x dl.  Near full extension the previous hinge is kept (no twist pops)."""
    du = du.normalized(); dl = dl.normalized()
    a0 = (REST[nu] @ Vector((0, 1, 0))).normalized()
    h0 = a0.cross(flex_dir).normalized()
    h = du.cross(dl)
    prev = HINGE_PREV.get(nu)
    if h.length < 0.17:                         # elbow/knee within ~10 deg of straight
        h = prev if prev is not None else h0
        h = (h - du * h.dot(du)).normalized()
        if prev is not None and h.length > 0.5: pass
    else:
        h = h.normalized()
        if prev is not None:
            hp = (prev - du * prev.dot(du)).normalized()
            w = min(1.0, (du.cross(dl).length - 0.17) / 0.2)
            h = (hp * (1 - w) + h * w).normalized()
    HINGE_PREV[nu] = h.copy()
    Wm = Matrix((du, h, du.cross(h))).transposed(); Rm = Matrix((a0, h0, a0.cross(h0))).transposed()
    set_world3(nu, Wm @ Rm.inverted() @ REST[nu]); bpy.context.view_layer.update()
    aim(nl, dl); bpy.context.view_layer.update()

# source rest foot direction (BVH offsets) -> to estimate foot delta rotation
foot_rest_src = {s: (R_SD @ V(next(j["offset"] for j in J if j["name"] == s + "Ankle_End"))).normalized() for s in ("Left", "Right")}
def sample(t):
    x = t / dt; i = max(0, min(len(SRCW) - 2, int(math.floor(x)))); u = x - i
    a, b = SRCW[i], SRCW[i + 1]
    return {k: ([a[k][0][j] * (1 - u) + b[k][0][j] * u for j in range(3)], None) for k in a}

GRIP_Q = {k: Quaternion(v) for k, v in GR["grip_q"].items()}
HOLD_Q = {k: Quaternion(v) for k, v in GR["hold_q"].items()}
nF = int(round((PRE + POST) * FPS)) + 1
C = 1 + int(round(PRE * FPS))
pel_rest = B["pelvis"].head_local.copy()
# horizontal placement: feet midpoint at the start -> just right of the centre mark, toes behind the baseline
w_first = sample(0.0)
mid0 = (P(w_first, "LeftAnkle") + P(w_first, "RightAnkle")) * 0.5 * S
OFFS = Vector((-0.30 - mid0.x, 0.30 - mid0.y, 0.0))

def kai_sole_clear():
    out = []
    for s in ("l", "r"):
        a = world_head(rig, "foot_" + s).z - 0.077; bz = world_head(rig, "ball_" + s).z - 0.009; tz = world_tail(rig, "ball_" + s).z - 0.014
        out.append(min(a, bz, tz))
    return min(out), out

# ---------------- pass 1: body
ROOTPOS = {}; GRIPP = {}; FORE = {}; UPPER = {}; HANDL = {}
GRIP_LOCAL = None
for k in range(nF):
    f = 1 + k; t = k / FPS
    sc.frame_set(f); reset(rig)
    w = sample(t)
    for kk, q in GRIP_Q.items(): rig.pose.bones[kk].rotation_quaternion = q
    hips = P(w, "Hips") * S + OFFS
    root = rig.pose.bones["Root"]
    root.location = Vector((hips.x - pel_rest.x, hips.y - pel_rest.y, 0.0))
    bpy.context.view_layer.update()
    hipline = P(w, "LeftHip") - P(w, "RightHip"); shline = P(w, "LeftShoulder") - P(w, "RightShoulder")
    pel_up = P(w, "Chest") - P(w, "Hips"); ch_up = P(w, "Neck") - P(w, "Chest")
    hd_up = P(w, "Head_End") - P(w, "Neck")
    # trunk: pelvis frame -> chest frame distributed over spine_01..03
    Fp = frame(pel_up, hipline); Fc = frame(ch_up, shline)
    qp = (Fp @ UPRIGHT.inverted()).to_quaternion(); qc = (Fc @ UPRIGHT.inverted()).to_quaternion()
    if qp.dot(qc) < 0: qc = -qc
    for n, u in (("pelvis", 0.0), ("spine_01", 0.33), ("spine_02", 0.66), ("spine_03", 1.0)):
        set_world3(n, qp.slerp(qc, u).to_matrix() @ REST[n]); bpy.context.view_layer.update()
    qh = (frame(hd_up, shline) @ UPRIGHT.inverted()).to_quaternion()
    if qh.dot(qc) < 0: qh = -qh
    set_world3("neck_01", qc.slerp(qh, 0.5).to_matrix() @ REST["neck_01"]); bpy.context.view_layer.update()
    set_world3("head", qh.to_matrix() @ REST["head"]); bpy.context.view_layer.update()
    # limbs: exact directions
    for n, a, b in (("clavicle_l", "LeftCollar", "LeftShoulder"), ("clavicle_r", "RightCollar", "RightShoulder")):
        if n.startswith("clavicle"):
            # clavicles: only the elevation part of the source collar->shoulder (source rest = horizontal)
            d = P(w, b) - P(w, a); rest_d = (REST[n] @ Vector((0, 1, 0)))
            # keep Kai's clavicle, add source elevation change
            el = math.asin(max(-1, min(1, d.normalized().z))); el0 = math.asin(max(-1, min(1, rest_d.normalized().z)))
            cur = (base3(n) @ Vector((0, 1, 0))).normalized()
            axis = cur.cross(Vector((0, 0, 1)))
            if axis.length > 1e-6:
                set_world3(n, Quaternion(axis.normalized(), (el - el0) * 0.6).to_matrix() @ base3(n))
        else:
            aim(n, P(w, b) - P(w, a))
        bpy.context.view_layer.update()
    FWD, BACK = Vector((0, -1, 0)), Vector((0, 1, 0))      # rest pose faces -Y: elbows flex forward, knees flex backward
    for side, s_ in (("l", "Left"), ("r", "Right")):
        aim_hinge("upperarm_" + side, "lowerarm_" + side, P(w, s_ + "Elbow") - P(w, s_ + "Shoulder"), P(w, s_ + "Wrist") - P(w, s_ + "Elbow"), FWD)
        aim_hinge("thigh_" + side, "calf_" + side, P(w, s_ + "Knee") - P(w, s_ + "Hip"), P(w, s_ + "Ankle") - P(w, s_ + "Knee"), BACK)
    # feet: delta rotation of the source foot vs its rest direction, applied to Kai's rest foot
    for s, side in (("l", "Left"), ("r", "Right")):
        d = (P(w, side + "Ankle_End") - P(w, side + "Ankle")).normalized()
        q = foot_rest_src[side].rotation_difference(d)
        # source rest foot faces the BVH rest +Z; Kai rest foot faces -Y. Express the delta about the shin frame:
        R_pel = (frame(pel_up, hipline) @ UPRIGHT.inverted())
        kai_rest_dir = (R_pel @ (REST["foot_" + s] @ Vector((0, 1, 0))))
        src_rest_dir = (R_pel @ (R_SD @ Vector((0, -0.28, 0.96))).normalized()) if False else None
        # simpler & stable: point Kai's foot so its toe direction (horizontal heading + pitch) matches the source
        heading = Vector((d.x, d.y, 0)).normalized()
        pitch_src = math.asin(max(-1, min(1, d.z))) - math.asin(max(-1, min(1, foot_rest_src[side].z)))
        rest_pitch = math.radians(26.8)
        p = -rest_pitch + pitch_src
        fd = heading * math.cos(p) + Vector((0, 0, 1)) * math.sin(p)
        aim("foot_" + s, fd); bpy.context.view_layer.update()
        aim("ball_" + s, Vector((heading.x, heading.y, 0.07 + max(0, pitch_src) * 0.3))); bpy.context.view_layer.update()
    # vertical root: match ground clearance
    want, _ = src_clear(w); want *= S
    have, _ = kai_sole_clear()
    root.location.z += want - have
    bpy.context.view_layer.update()
    for pb in rig.pose.bones: pb.keyframe_insert("rotation_quaternion", frame=f)
    root.keyframe_insert("location", frame=f)
    if GRIP_LOCAL is None:
        GRIP_LOCAL = racket.matrix_world.inverted() @ (racket.matrix_world @ Vector((0, 0.075, 0)))
    GRIPP[f] = (racket.matrix_world @ Vector((0, 0.075, 0))).copy()
    FORE[f] = (world_tail(rig, "lowerarm_r") - world_head(rig, "lowerarm_r")).normalized()
    UPPER[f] = (world_tail(rig, "upperarm_r") - world_head(rig, "upperarm_r")).normalized()
    HANDL[f] = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix).copy()
print("PASS1 baked", nF, "frames; contact frame", C)

# ---------------- racket rod simulation (physics)
def smooth_series(d, n=2):
    ks = sorted(d); vals = [d[k] for k in ks]
    for _ in range(n):
        vals = [vals[0]] + [(vals[i - 1] + vals[i] * 2 + vals[i + 1]) * 0.25 for i in range(1, len(vals) - 1)] + [vals[-1]]
    return dict(zip(ks, vals))
GP = smooth_series(GRIPP, 2)
def interp(d, x):
    fl = max(1, min(nF - 1, int(math.floor(x)))); u = max(0.0, min(1.0, x - fl))
    return d[fl].lerp(d[fl + 1], u) if isinstance(d[fl], Vector) else d[fl] * (1 - u) + d[fl + 1] * u
def accel(x, h=0.5):
    a = interp(GP, x - h); b = interp(GP, x); c = interp(GP, x + h)
    return (a - b * 2 + c) / ((h / FPS) ** 2)
MASS, LCM, I_GRIP = 0.31, 0.255, 0.31 * 0.255 ** 2 + 0.018
def simulate(k_wrist, c_wrist, rom_deg=88.0):
    u = FORE[1].copy(); wv = Vector((0, 0, 0)); h = 1.0 / (FPS * 20)
    out = {1: u.copy()}
    x = 1.0
    while x < nF:
        d = interp(FORE, x).normalized()
        g_eff = Vector((0, 0, -G)) - accel(x)
        tau = (u * LCM).cross(g_eff * MASS) + u.cross(d) * k_wrist - wv * c_wrist
        ang = math.degrees(u.angle(d))
        if ang > rom_deg:                       # passive end-range stiffness (ligaments)
            tau += u.cross(d) * k_wrist * 6.0 * (ang - rom_deg) / 10.0
        wv += tau / I_GRIP * h
        wv -= u * wv.dot(u)                     # no spin about the rod axis in this model
        u = (Quaternion(wv.normalized(), wv.length * h) @ u).normalized() if wv.length > 1e-9 else u
        x += h * FPS
        fi = int(round(x))
        if abs(x - fi) < h * FPS * 0.5 and fi not in out: out[fi] = u.copy()
    for fi in range(1, nF + 1):
        if fi not in out: out[fi] = out[max(k for k in out if k < fi)]
    return out
def tip_speed(rod):
    sp = {}
    for f in range(2, nF + 1):
        a = GP[f - 1] + rod[f - 1] * 0.425; b = GP[f] + rod[f] * 0.425
        sp[f] = (b - a).length * FPS
    return sp
best = None
for kw in (2.0, 3.0, 4.5, 6.0, 8.0, 11.0, 15.0):
    for cw in (0.05, 0.12, 0.25):
        rod = simulate(kw, cw); sp = tip_speed(rod)
        pk = max(range(C - 12, C + 6), key=lambda f: sp[f])
        align = math.degrees(rod[C].angle(FORE[C])); drop = max(math.degrees(rod[f].angle(FORE[f])) for f in range(C - 20, C - 2))
        score = abs(pk - C) * 3 + abs(sp[C] - 41) / 4 + max(0, align - 25) / 5 + max(0, 55 - drop) / 10
        if best is None or score < best[0]: best = (score, kw, cw, pk, sp[C], align, drop, rod)
score, KW, CW, pk, vC, alignC, dropMax, ROD = best
print(f"ROD k={KW} c={CW} peak_frame={pk} (contact {C}) tip_speed@C={vC:.1f} m/s align@C={alignC:.0f} deg max_lag_before={dropMax:.0f} deg")

# ---------------- pass 2: racket hand + face rotation + fingers on the left until release
H0 = rig.pose.bones["hand_r"].matrix.copy() if False else None
reset(rig); sc.frame_set(1)
# rigid racket-in-hand relation from the rest grip
bpy.context.view_layer.update()
H_rest = (rig.matrix_world @ rig.pose.bones["hand_r"].matrix).to_3x3()
for kk, q in GRIP_Q.items(): pass
R_rest = racket.matrix_world.to_3x3()
HAND_FROM_RACKET = R_rest.inverted() @ H_rest
# ball release frame: left wrist vertical velocity falls below 50% after its peak (before contact)
vz = {f: (HANDL[f + 1].translation.z - HANDL[f - 1].translation.z) * FPS / 2 for f in range(2, nF)}
vpk_f = max(range(2, C - 10), key=lambda f: vz[f])
REL = next(f for f in range(vpk_f, C) if vz[f] < 0.5 * vz[vpk_f])
print("TOSS left-hand vz peak", round(vz[vpk_f], 2), "m/s at", vpk_f, "-> release frame", REL)
prev_n = None; log = []
for f in range(1, nF + 1):
    sc.frame_set(f)
    u = ROD[f]
    # tip velocity for the face rule
    v = (GP[min(nF, f + 1)] + ROD[min(nF, f + 1)] * 0.425) - (GP[max(1, f - 1)] + ROD[max(1, f - 1)] * 0.425)
    vperp = v - u * v.dot(u)
    tc = (f - C) / FPS
    if vperp.length > 0.02:
        n_edge = u.cross(vperp).normalized()
        alpha = 0.0 if tc < -0.07 else (math.radians(90) * min(1.0, (tc + 0.07) / 0.07) if tc <= 0 else math.radians(90 + 70 * min(1.0, tc / 0.15)))
        n = (Quaternion(u, alpha) @ n_edge).normalized()
    else:
        n = prev_n if prev_n is not None else u.cross(Vector((0, 0, 1))).normalized()
    n = (n - u * n.dot(u)).normalized()
    if prev_n is not None and n.dot(prev_n) < 0 and vperp.length <= 0.02: n = -n
    if prev_n is not None:   # temporal smoothing of face orientation (avoid pops in slow phases)
        n = (prev_n * (0.0 if vperp.length > 1.0 else 0.6) + n * (1.0 if vperp.length > 1.0 else 0.4)); n = (n - u * n.dot(u)).normalized()
    prev_n = n.copy()
    Xr = u.cross(n).normalized()
    Rr = Matrix((Xr, u, n)).transposed()
    Hd = Rr @ HAND_FROM_RACKET
    pbH = rig.pose.bones["hand_r"]; pbF = rig.pose.bones["lowerarm_r"]
    baseH = pbF.matrix.to_3x3() @ REST["lowerarm_r"].inverted() @ REST["hand_r"]
    q_rel = (baseH.inverted() @ Hd).to_quaternion()
    # wrist ROM: swing (flex/ext + deviation) <= 85 deg, pronation/supination within -110..+110 (forearm+wrist)
    vq = Vector((q_rel.x, q_rel.y, q_rel.z)); proj = Vector((0, 1, 0)) * vq.y
    tw = Quaternion((q_rel.w, proj.x, proj.y, proj.z)); tw = tw.normalized() if tw.magnitude > 1e-9 else Quaternion()
    sw = q_rel @ tw.inverted()
    sw_ang = 2 * math.acos(min(1.0, abs(sw.w)))
    if sw_ang > math.radians(85):
        ax = Vector((sw.x, sw.y, sw.z)).normalized() * (1 if sw.w >= 0 else -1); sw = Quaternion(ax, math.radians(85))
    tw_ang = 2 * math.atan2(tw.y, tw.w)
    tw_ang = (tw_ang + math.pi) % (2 * math.pi) - math.pi
    tw_c = max(math.radians(-110), min(math.radians(110), tw_ang))
    pbH.rotation_quaternion = sw @ Quaternion(Vector((0, 1, 0)), tw_c)
    rig.pose.bones["lowerarm_twist_01_r"].rotation_quaternion = Quaternion(Vector((0, 1, 0)), tw_c * 0.5)
    # left hand fingers: hold the ball until release, then relax open
    for kk, q in HOLD_Q.items():
        rig.pose.bones[kk].rotation_quaternion = q if f < REL else Quaternion().slerp(q, max(0.0, 1 - (f - REL) / 8.0) * 0.6)
    bpy.context.view_layer.update()
    for nme in ["hand_r", "lowerarm_twist_01_r"] + list(HOLD_Q.keys()):
        rig.pose.bones[nme].keyframe_insert("rotation_quaternion", frame=f)
    log.append((f, round(math.degrees(sw_ang)), round(math.degrees(tw_ang))))

# ---------------- ball: in the left hand until release, ballistic to contact, then outgoing
sc.frame_set(REL)
rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C)
Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Vector((0, 0, 1))).normalized()
if face_n.dot(Vector((0, -1, 0))) < 0: face_n = -face_n
sweet = Rm @ Vector((0, 0.50, 0)); ball_c = sweet + face_n * 0.0335
tf = (C - REL) / FPS
vb = (ball_c - rel_p + Vector((0, 0, 0.5 * G * tf * tf))) / tf
apex = rel_p.z + max(0, vb.z) ** 2 / (2 * G); apex_before = tf - vb.z / G
print(f"BALL release_z={rel_p.z:.2f} contact_z={ball_c.z:.2f} toss_vz={vb.z:.2f} apex={apex:.2f} m apex_before_contact={apex_before:.2f} s horiz={math.hypot(vb.x, vb.y):.2f} m/s")
ball.parent = None
outv = (Vector((0.05, -0.97, -0.06))).normalized() * 48.0
bp = {}
for f in range(1, nF + 1):
    if f < REL:
        sc.frame_set(f); p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
    elif f <= C:
        tt = (f - REL) / FPS; p = rel_p + vb * tt - Vector((0, 0, 0.5 * G * tt * tt))
    else:
        tt = (f - C) / FPS; p = ball_c + outv * tt - Vector((0, 0, 0.5 * G * tt * tt))
    ball.location = p; ball.keyframe_insert("location", frame=f); bp[f] = list(p)

# ---------------- events for QA / viewer
def feet_air(f):
    sc.frame_set(f); c, per = kai_sole_clear(); return per
air = [f for f in range(1, nF + 1) if min(feet_air(f)) > 0.03]
takeoff = next((f for f in air if f > C - 30), None); land = None
if takeoff:
    seq = [f for f in air if f >= takeoff]
    end = takeoff
    for f in seq:
        if f == end or f == end + 1: end = f
        else: break
    land = end + 1
pel_z = {}
for f in range(1, nF + 1):
    sc.frame_set(f); pel_z[f] = world_head(rig, "pelvis").z
trophy = min(range(REL, C), key=lambda f: pel_z[f])
tipz = {}
for f in range(trophy, C):
    sc.frame_set(f); tipz[f] = (racket.matrix_world @ Vector((0, 0.68, 0))).z
drop = min(tipz, key=tipz.get)
T = dict(start=1, toss=max(1, vpk_f - 18), release=REL, trophy=trophy, drop=drop, contact=C, decel=C + 9,
         finish=min(nF, C + 40), end=nF, takeoff=takeoff, land=land)
print("EVENTS", T)
sc.frame_start, sc.frame_end = 1, nF
json.dump({"T": T, "fps": FPS, "takeoff": takeoff, "land": land, "drag_windows": ({"l": [takeoff - 12, takeoff], "r": [takeoff - 12, takeoff]} if takeoff else {}), "toss_v": list(vb), "toss_apex": apex,
           "contact_ball": list(ball_c), "face_normal": list(face_n), "ball": bp, "wrist": log,
           "source": {"dataset": "Tennis-MoCap (Pulgarin-Giraldo et al. 2017)", "license": "CC BY-SA 3.0",
                      "url": "https://github.com/jdpulgarin/Tennis-MoCap", "file": SRC, "contact_frame_100hz": C_SRC,
                      "player_level": "high performance, male, right-handed", "scale": S},
           "rod": {"k": KW, "c": CW, "align_at_contact_deg": alignC, "max_lag_deg": dropMax}},
          open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
