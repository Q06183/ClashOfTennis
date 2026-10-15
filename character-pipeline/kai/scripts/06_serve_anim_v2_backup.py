"""Step 6 (v2): professional flat first serve, right-handed, pinpoint stance, deuce court, 60 fps.

Biomechanical timing (Kovacs & Ellenbecker 2011; Fleisig et al. 2003 Olympic serve data, C = contact):
  front-knee extension velocity peak  C - 0.18 s  (~11 frames)
  max shoulder external rotation      C - 0.09 s  (~5 frames)   -> "drop" key
  pelvis yaw-velocity peak             C - 0.10 s
  upper-torso yaw-velocity peak        C - 0.06 s
  upper-arm, forearm/racket peaks      C - 0.03 s .. C
Contact: arm ~100-110 deg abducted relative to the trunk, elbow ~20 deg, front knee ~24 deg, airborne, ball in front.

Implementation principles
  * court frame: N = towards net (-Y world), RT = server's right when facing net (-X world), U = up.
  * scalar channels use time-warped smoothstep transitions with an explicit velocity-peak frame.
  * feet: planted feet are locked at their ground contact point; heel raise pivots about the ball of the foot,
    so a planted foot can never slide or sink. Pelvis height is clamped to leg reach (min 5 deg knee flex).
  * flight: pelvis follows a true projectile (vertical parabola with g = 9.81, constant horizontal velocity).
    Landing frame is found where the parabola brings the left hip within reach of the landing spot.
  * racket: world orientation keys (slerp, time-warped so angular velocity peaks at contact); hand rotation is
    derived from the racket orientation; forearm pronation is the twist part of a swing-twist decomposition.
  * ball: released from the left hand, ballistic, meets the strings at contact, leaves at ~48 m/s.
"""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, reset, aim_bone, two_bone_ik, world_head, world_tail, chain_rot, set_world_rot

FPS = 60; G = 9.81
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]; ball = bpy.data.objects["Kai_Ball"]; racket = bpy.data.objects["Kai_Racket"]
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
sc = bpy.context.scene; sc.render.fps = FPS
B = {b.name: b for b in rig.data.bones}
N, RT, U = Vector((0, -1, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1))
reset(rig)
for o in [o for o in bpy.data.objects if o.animation_data]:
    o.animation_data_clear()

# ------------------------------------------------------------------ helpers
def clamp01(x): return max(0.0, min(1.0, x))
def smooth(u): u = clamp01(u); return u * u * (3 - 2 * u)
def warp(u, p):
    """time warp so smoothstep's velocity peak lands at normalized time p"""
    u = clamp01(u); p = min(0.95, max(0.05, p))
    k = math.log(0.5) / math.log(p)
    return smooth(u ** k)
class Channel:
    """piecewise transitions: list of (f0, f1, fpeak, value_at_f1); starts at v0"""
    def __init__(self, v0, segs): self.v0 = v0; self.segs = segs
    def __call__(self, f):
        v = self.v0
        for f0, f1, fp, val in self.segs:
            if f <= f0: return v
            u = (f - f0) / (f1 - f0); p = (fp - f0) / (f1 - f0)
            if f < f1: return v + (val - v) * warp(u, p)
            v = val
        return v
def hermite(p0, v0, p1, v1, t0, t1, t):
    h = t1 - t0; s = clamp01((t - t0) / h)
    h00 = 2*s**3 - 3*s**2 + 1; h10 = s**3 - 2*s**2 + s; h01 = -2*s**3 + 3*s**2; h11 = s**3 - s**2
    return p0 * h00 + v0 * h * h10 + p1 * h01 + v1 * h * h11
def yawq(deg): return Quaternion(U, math.radians(deg))

# ------------------------------------------------------------------ timing
C = 78                                   # contact frame
T = dict(start=1, toss=14, release=36, pinpoint_end=50, trophy=58, drop=C - 5, contact=C, decel=C + 9, finish=C + 44, end=C + 62)
TAKEOFF = C - 8                          # leaves ground 0.133 s before contact
KNEE_PEAK = C - 11

# ------------------------------------------------------------------ rest anatomy
pel0 = B["pelvis"].head_local.copy(); STAND_H = pel0.z
L_THIGH, L_CALF = B["thigh_l"].length, B["calf_l"].length
LEG_MAX = math.sqrt(L_THIGH**2 + L_CALF**2 + 2 * L_THIGH * L_CALF * math.cos(math.radians(5)))
foot_rest = (B["foot_l"].tail_local - B["foot_l"].head_local)
FOOT_LEN = foot_rest.length
FOOT_PITCH0 = math.degrees(math.asin(-foot_rest.normalized().z))           # ~26.8 deg down
BALL_Z = B["ball_l"].head_local.z                                           # ball joint height at rest
print("ANAT stand", round(STAND_H, 3), "leg_max", round(LEG_MAX, 3), "foot_len", round(FOOT_LEN, 3), "foot_pitch", round(FOOT_PITCH0, 1))

# ------------------------------------------------------------------ feet plan (ball-joint ground points, yaw, heel lift deg)
# Deuce court: server just right of the centre mark, front toes behind the baseline (baseline at y = -0.25).
FL0 = Vector((0.06, -0.14, BALL_Z)); YAW_FL = -40          # front (left) foot points toward the right net post
FR0 = Vector((-0.30, 0.32, BALL_Z)); YAW_FR = -85          # back (right) foot ~parallel to baseline
FR_PIN = Vector((-0.06, 0.06, BALL_Z))                       # back foot slides up next to the front foot
FL_LAND = Vector((0.04, -0.70, BALL_Z)); YAW_FL_LAND = -20   # lands on the left foot inside the court
FR_STEP = Vector((-0.32, -1.02, BALL_Z)); YAW_FR_STEP = -15  # right foot steps through to recover balance

heelL = Channel(0, [(T["trophy"] - 4, TAKEOFF, TAKEOFF - 2, 38)])
heelR = Channel(0, [(T["toss"] + 8, T["toss"] + 14, T["toss"] + 11, 22), (T["toss"] + 14, T["pinpoint_end"], T["pinpoint_end"] - 4, 8),
                    (T["trophy"] - 4, TAKEOFF, TAKEOFF - 2, 42)])

def foot_dir(yaw, heel_deg):
    pitch = math.radians(FOOT_PITCH0 + heel_deg)
    return yawq(yaw) @ Vector((0, -math.cos(pitch), -math.sin(pitch)))
def ankle_from_ball(ballpt, yaw, heel_deg):
    return ballpt - foot_dir(yaw, heel_deg) * FOOT_LEN

# ------------------------------------------------------------------ pelvis horizontal (C1 with constant velocity in flight)
P_START = Vector((-0.10, 0.06, 0)); P_BACK = Vector((-0.14, 0.14, 0)); P_TROPHY = Vector((-0.04, -0.02, 0))
P_TAKEOFF = Vector((-0.02, -0.18, 0))
# landing pelvis xy is determined after solving the flight; set provisional horizontal speed (m/s) into court
V_H = Vector((0.02, -1.15, 0))
P_SETTLE = Vector((-0.16, -0.92, 0)); P_FINAL = Vector((-0.16, -0.90, 0))

# ------------------------------------------------------------------ torso channels (degrees)
# yaw: negative = clockwise from above (side-on, left shoulder toward the net). shoulder line = chest yaw.
pel_yaw = Channel(-70, [(T["toss"], T["trophy"], T["release"], -88),
                        (T["trophy"], C + 6, C - 6, -10), (C + 6, T["finish"], C + 10, 18)])
chest_yaw = Channel(-78, [(T["toss"], T["trophy"], T["release"] + 6, -112),
                          (T["trophy"] + 2, C + 4, C - 4, -2), (C + 4, T["finish"], C + 8, 28)])
# lateral: + = right shoulder UP (shoulder-over-shoulder at contact), - = right shoulder down (rear tilt at trophy)
lateral = Channel(0, [(T["toss"], T["trophy"], T["release"] + 8, -16), (T["trophy"], C, C - 4, 26), (C, T["finish"], C + 8, 2)])
# sagittal: + = extension / arch back, - = flexion forward
sagittal = Channel(0, [(T["toss"], T["drop"], T["trophy"], 14), (T["drop"], C + 8, C + 1, -24), (C + 8, T["finish"], C + 22, -6)])

# ------------------------------------------------------------------ arms: wrist targets in TORSO frame (f fwd, r right, u up)
def torso_frame():
    m = (rig.matrix_world @ rig.pose.bones["spine_03"].matrix).to_3x3()
    rest = B["spine_03"].matrix_local.to_3x3()
    R = m @ rest.inverted()
    return (R @ Vector((0, -1, 0))).normalized(), (R @ Vector((-1, 0, 0))).normalized(), (R @ Vector((0, 0, 1))).normalized()

RW = [  # frame, (f, r, u) offsets of right wrist from right shoulder
    (T["start"], (0.36, -0.12, -0.36)),
    (T["toss"], (0.30, -0.02, -0.42)),
    (T["release"] - 8, (0.02, 0.24, -0.48)),
    (T["release"], (-0.14, 0.34, -0.30)),
    (T["trophy"], (-0.06, 0.30, 0.26)),
    (T["drop"], (0.02, 0.16, 0.14)),
    (C, (0.16, 0.10, 0.54)),
    (T["decel"], (0.44, -0.22, 0.02)),
    (T["finish"], (0.22, -0.46, -0.42)),
    (T["end"], (0.20, -0.44, -0.44)),
]
LW = [
    (T["start"], (0.34, 0.22, -0.34)),
    (T["toss"], (0.30, 0.14, -0.40)),
    (T["release"], (0.10, 0.06, 0.56)),
    (T["trophy"], (0.12, 0.04, 0.58)),
    (C - 2, (0.30, 0.20, -0.18)),
    (T["finish"], (0.20, 0.12, -0.46)),
    (T["end"], (0.18, 0.10, -0.47)),
]
def key_interp(keys, f, swing=False):
    for (f0, a), (f1, b) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            u = (f - f0) / (f1 - f0)
            if swing and f0 == T["drop"]: u = warp(u, 0.92)        # accelerate into contact
            elif swing and f0 == C: u = warp(u, 0.08)             # decelerate after contact
            else: u = smooth(u)
            return [x + (y - x) * u for x, y in zip(a, b)]
    return list(keys[-1][1] if f > keys[-1][0] else keys[0][1])

# ------------------------------------------------------------------ racket orientation keys (court frame)
def rk(Y, Zh):
    Y = Y.normalized(); Z = (Zh - Zh.dot(Y) * Y).normalized(); X = Y.cross(Z).normalized()
    return Matrix((X, Y, Z)).transposed().to_quaternion()
RQ = [
    (T["start"], rk(N * 0.75 + U * 0.45 + RT * 0.10, RT)),
    (T["toss"], rk(N * 0.70 + U * 0.30 + RT * 0.25, RT)),
    (T["release"] - 8, rk(-U * 0.85 + RT * 0.45 + N * 0.15, N)),
    (T["release"], rk(-U * 0.45 - N * 0.65 + RT * 0.45, RT)),
    (T["trophy"], rk(U * 0.80 - N * 0.45 + RT * 0.25, RT)),
    (T["drop"], rk(-U * 0.85 - N * 0.35 + RT * 0.25, RT)),
    (C - 2, rk(RT * 0.60 - N * 0.45 + U * 0.55, (RT * 0.60 - N * 0.45 + U * 0.55).cross(U))),
    (C, rk(U * 0.94 + N * 0.26 + RT * 0.08, N)),
    (T["decel"], rk(N * 0.55 - U * 0.45 - RT * 0.70, RT)),
    (T["finish"], rk(-N * 0.35 - U * 0.70 - RT * 0.60, RT)),
    (T["end"], rk(-N * 0.35 - U * 0.72 - RT * 0.58, RT)),
]
def racket_q(f):
    for (f0, a), (f1, b) in zip(RQ, RQ[1:]):
        if f0 <= f <= f1:
            u = (f - f0) / (f1 - f0)
            if f0 in (T["drop"], C - 2): u = warp(u, 0.9)
            elif f0 == C: u = warp(u, 0.1)
            else: u = smooth(u)
            if a.dot(b) < 0: b = -b
            return a.slerp(b, u)
    return RQ[-1][1]

# rigid racket-in-hand relation (from the grip solve, rest pose)
H0 = rig.pose.bones["hand_r"].matrix.copy()                 # armature space == world (rig at identity)
R0 = racket.matrix_world.copy()
HAND_FROM_RACKET = R0.inverted() @ H0                         # H = R @ HAND_FROM_RACKET

def set_bone_world_rot(bname, Rw):
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bname]
    base = (pb.parent.matrix @ pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local) if pb.parent else pb.bone.matrix_local
    pb.rotation_quaternion = (base.to_3x3().inverted() @ Rw.to_3x3()).to_quaternion()

def swing_twist(q, axis):
    p = Vector((q.x, q.y, q.z)); proj = axis * p.dot(axis)
    tw = Quaternion((q.w, proj.x, proj.y, proj.z)); 
    if tw.magnitude < 1e-9: tw = Quaternion()
    tw.normalize(); sw = q @ tw.inverted()
    return sw, tw

# ------------------------------------------------------------------ pelvis vertical: stance, load, drive, flight, landing
Z_TROPHY = STAND_H - 0.20          # ~65 deg knee flex at trophy (clamped by reach anyway)
PEAK_RISE = 0.20
V0 = math.sqrt(2 * G * PEAK_RISE)
def z_ground_phase(f):
    if f <= T["release"]:
        return STAND_H - 0.05 - 0.02 * smooth((f - T["toss"]) / (T["release"] - T["toss"]))
    if f <= T["trophy"]:
        return hermite(STAND_H - 0.07, 0.0, Z_TROPHY, 0.0, T["release"], T["trophy"] + 2, f)
    return None

# ------------------------------------------------------------------ main bake
GRIP_Q = {k: Quaternion(v) for k, v in GR["grip_q"].items()}
HOLD_Q = {k: Quaternion(v) for k, v in GR["hold_q"].items()}
frames = list(range(T["start"], T["end"] + 1))
state = {}
z_takeoff = None; land_f = None; xy_takeoff = None; z_land = None; vz_land = None

def pose_torso(f, root_xy, root_z):
    root = rig.pose.bones["Root"]
    root.location = Vector((root_xy.x - pel0.x, root_xy.y - pel0.y, root_z - STAND_H))
    py, cy = pel_yaw(f), chest_yaw(f); lat, sag = lateral(f), sagittal(f)
    fwd_p = yawq(py) @ Vector((0, -1, 0)); right_p = fwd_p.cross(U)
    fwd_c = yawq(cy) @ Vector((0, -1, 0)); right_c = fwd_c.cross(U)
    d = cy - py
    chain_rot(rig, [("pelvis", U, py), ("pelvis", right_p, sag * 0.15),
                    ("spine_01", U, d * 0.25), ("spine_01", right_c, sag * 0.25), ("spine_01", fwd_c, -lat * 0.25),
                    ("spine_02", U, d * 0.35), ("spine_02", right_c, sag * 0.30), ("spine_02", fwd_c, -lat * 0.35),
                    ("spine_03", U, d * 0.40), ("spine_03", right_c, sag * 0.30), ("spine_03", fwd_c, -lat * 0.40)])
    bpy.context.view_layer.update()

def hips():
    return world_head(rig, "thigh_l"), world_head(rig, "thigh_r")

def clamp_to_reach(f, root_xy, root_z, ankles):
    """lower the root until every planted ankle is within LEG_MAX of its hip"""
    for _ in range(3):
        pose_torso(f, root_xy, root_z)
        hl, hr = hips(); drop = 0.0
        for side, a in ankles.items():
            if a is None: continue
            h = hl if side == "l" else hr
            dxy = math.hypot(h.x - a.x, h.y - a.y)
            if dxy >= LEG_MAX: drop = max(drop, 0.0); continue
            zmax = a.z + math.sqrt(LEG_MAX**2 - dxy**2)
            drop = max(drop, h.z - zmax)
        if drop <= 1e-5: break
        root_z -= drop + 1e-4
    return root_z

def leg(side, ankle, yaw, heel_deg, ball_flat=True):
    hip = world_head(rig, "thigh_" + side)
    toe = yawq(yaw) @ Vector((0, -1, 0))
    out = Vector((0.25 if side == "l" else -0.25, 0, 0))
    two_bone_ik(rig, "thigh_" + side, "calf_" + side, ankle, (toe + out).normalized())
    aim_bone(rig, "foot_" + side, foot_dir(yaw, heel_deg)); bpy.context.view_layer.update()
    tdir = yawq(yaw) @ Vector((0, -1, 0.07)) if ball_flat else foot_dir(yaw, heel_deg * 0.4)
    aim_bone(rig, "ball_" + side, tdir); bpy.context.view_layer.update()

log = []
for f in frames:
    sc.frame_set(f); reset(rig)
    # fingers
    for k, q in GRIP_Q.items(): rig.pose.bones[k].rotation_quaternion = q
    if f < T["release"]:
        for k, q in HOLD_Q.items(): rig.pose.bones[k].rotation_quaternion = q
    # -------- feet & pelvis by phase
    if f < TAKEOFF:
        u = smooth((f - (T["toss"] + 8)) / (T["pinpoint_end"] - (T["toss"] + 8)))
        fr = FR0.lerp(FR_PIN, u); fr = fr + Vector((0, 0, 0.025 * math.sin(math.pi * u))) if 0 < u < 1 else fr
        fl = FL0
        hl, hr = heelL(f), heelR(f)
        aL = ankle_from_ball(fl, YAW_FL, hl); aR = ankle_from_ball(fr, YAW_FR, hr)
        # pelvis xy
        if f <= T["release"]: pxy = P_START.lerp(P_BACK, smooth((f - T["toss"]) / (T["release"] - T["toss"])))
        elif f <= T["trophy"]: pxy = P_BACK.lerp(P_TROPHY, smooth((f - T["release"]) / (T["trophy"] - T["release"])))
        else: pxy = hermite(P_TROPHY, Vector((0, 0, 0)), P_TAKEOFF, V_H, T["trophy"] / FPS, TAKEOFF / FPS, f / FPS)
        zg = z_ground_phase(f)
        if zg is None:  # leg drive: rise towards full reach, velocity peak near takeoff (knee-extension peak ~C-11)
            zg = hermite(Z_TROPHY, 0.0, STAND_H + 0.10, V0 * 0.9, (T["trophy"] + 2) / FPS, TAKEOFF / FPS, f / FPS)
        z = clamp_to_reach(f, pxy, zg, {"l": aL, "r": aR if fr.z <= BALL_Z + 1e-4 or True else None})
        pose_torso(f, pxy, z)
        leg("l", aL, YAW_FL, hl); leg("r", aR, YAW_FR, hr)
        if f == TAKEOFF - 1:
            z_takeoff = z; xy_takeoff = pxy.copy()
    else:
        if z_takeoff is None: z_takeoff = STAND_H; xy_takeoff = P_TAKEOFF.copy()
        t = (f - (TAKEOFF - 1)) / FPS
        if land_f is None:
            z = z_takeoff + V0 * t - 0.5 * G * t * t
            pxy = xy_takeoff + V_H * t
            # landing test: left foot reaches the landing spot with toes down (heel 30 deg)
            aL_land = ankle_from_ball(FL_LAND, YAW_FL_LAND, 30)
            pose_torso(f, pxy, z); hl_, _ = hips()
            reach = (hl_ - aL_land).length
            descending = (V0 - G * t) < 0
            if descending and reach <= LEG_MAX * 0.985:
                land_f = f; z_land = z; vz_land = V0 - G * t; xy_land = pxy.copy()
        if land_f is None:
            # airborne: left leg reaches forward/down, right leg kicks back (knee ~90 deg)
            u = clamp01((f - TAKEOFF) / 22.0)
            hl_, hr_ = hips()
            aL = hl_.lerp(ankle_from_ball(FL_LAND, YAW_FL_LAND, 30), 1.0) if False else None
            tgtL = ankle_from_ball(FL_LAND, YAW_FL_LAND, 30)
            dirL = (tgtL - hl_); dirL = dirL.normalized() * min(dirL.length, LEG_MAX * (0.96 - 0.08 * math.sin(math.pi * u)))
            aL = hl_ + dirL
            kick = hr_ + (yawq(pel_yaw(f)) @ Vector((0.0, 0.0, 0.0))) + (-N) * (0.25 + 0.20 * smooth(u)) + Vector((0, 0, -0.62 + 0.22 * smooth(u)))
            pose_torso(f, pxy, z)
            leg("l", aL, YAW_FL + (YAW_FL_LAND - YAW_FL) * u, 30 + 8 * (1 - u), ball_flat=False)
            leg("r", kick, YAW_FR + (-40 - YAW_FR) * u, 55, ball_flat=False)
        else:
            # landing absorption on the left leg, then right foot steps through, settle
            tl = (f - land_f) / FPS
            step_f0, step_f1 = land_f + 4, land_f + 18
            pxy = hermite(xy_land, V_H, P_SETTLE, Vector((0, 0, 0)), land_f / FPS, (land_f + 30) / FPS, f / FPS) if f <= land_f + 30 else \
                  P_SETTLE.lerp(P_FINAL, smooth((f - land_f - 30) / max(1, T["end"] - land_f - 30)))
            zt = hermite(z_land, vz_land, STAND_H - 0.16, 0.0, land_f / FPS, (land_f + 12) / FPS, f / FPS) if f <= land_f + 12 else \
                 hermite(STAND_H - 0.16, 0.0, STAND_H - 0.06, 0.0, (land_f + 12) / FPS, T["end"] / FPS, f / FPS)
            hl = 30 * (1 - smooth((f - land_f) / 6.0))
            aL = ankle_from_ball(FL_LAND, YAW_FL_LAND, hl)
            us = clamp01((f - step_f0) / (step_f1 - step_f0))
            if f < step_f0:
                hl_, hr_ = hips()
                aR = hr_ + (-N) * 0.40 + Vector((0, 0, -0.45)); planted_R = False; yR, hR = -40, 55
            elif f < step_f1:
                # swing the right foot forward along an arc to the step point
                start = state.get("aR_step0")
                if start is None:
                    hl_, hr_ = hips(); start = hr_ + (-N) * 0.40 + Vector((0, 0, -0.45)); state["aR_step0"] = start
                goal = ankle_from_ball(FR_STEP, YAW_FR_STEP, 0)
                aR = start.lerp(goal, smooth(us)) + Vector((0, 0, 0.10 * math.sin(math.pi * us) * (1 - us)))
                planted_R = False; yR = -40 + (YAW_FR_STEP + 40) * smooth(us); hR = 55 * (1 - smooth(us))
            else:
                aR = ankle_from_ball(FR_STEP, YAW_FR_STEP, 0); planted_R = True; yR, hR = YAW_FR_STEP, 0
            z = clamp_to_reach(f, pxy, zt, {"l": aL, "r": aR if planted_R else None})
            pose_torso(f, pxy, z)
            leg("l", aL, YAW_FL_LAND, hl); leg("r", aR, yR, hR, ball_flat=planted_R)
    # -------- head & neck: keep eyes on the ball until contact, then toward the court
    bpy.context.view_layer.update()
    # -------- arms
    fv, rv, uv = torso_frame()
    shR, shL = world_head(rig, "upperarm_r"), world_head(rig, "upperarm_l")
    o = key_interp(RW, f, swing=True); wR = shR + fv * o[0] + rv * o[1] + uv * o[2]
    o = key_interp(LW, f); wL = shL + fv * o[0] + rv * o[1] + uv * o[2]
    poleR = (rv * 0.6 - uv * 0.8 + fv * 0.1) if f < T["release"] else (rv * 0.5 - uv * 0.3 - fv * 0.6) if f < C else (rv * 0.3 - uv * 0.9)
    two_bone_ik(rig, "upperarm_r", "lowerarm_r", wR, shR + poleR)
    poleL = (-rv * 0.5 - uv * 0.8 + fv * 0.2)
    two_bone_ik(rig, "upperarm_l", "lowerarm_l", wL, shL + poleL)
    bpy.context.view_layer.update()
    # -------- racket-driven hand + pronation (swing-twist about forearm axis)
    Rr = racket_q(f).to_matrix().to_4x4()
    Hd = (Rr @ R0.to_3x3().to_4x4().inverted() @ H0.to_3x3().to_4x4())       # desired hand rotation (world)
    fa = (world_tail(rig, "lowerarm_r") - world_head(rig, "lowerarm_r")).normalized()
    cur_fore = (rig.pose.bones["lowerarm_r"].matrix.to_3x3() @ B["lowerarm_r"].matrix_local.to_3x3().inverted())
    rel = (cur_fore.inverted() @ Hd.to_3x3() @ B["hand_r"].matrix_local.to_3x3().inverted() @ B["lowerarm_r"].matrix_local.to_3x3()).to_quaternion() if False else None
    set_bone_world_rot("hand_r", Hd)
    bpy.context.view_layer.update()
    # forearm twist bone takes half the pronation for skin
    pbH, pbF = rig.pose.bones["hand_r"], rig.pose.bones["lowerarm_r"]
    relq = (pbF.matrix.to_3x3().inverted() @ pbH.matrix.to_3x3()).to_quaternion() @ (B["lowerarm_r"].matrix_local.to_3x3().inverted() @ B["hand_r"].matrix_local.to_3x3()).to_quaternion().inverted()
    sw, tw = swing_twist(relq, Vector((0, 1, 0)))
    tw_angle = 2 * math.degrees(math.atan2(Vector((tw.x, tw.y, tw.z)).dot(Vector((0, 1, 0))), tw.w))
    sw_angle = math.degrees(2 * math.acos(min(1.0, abs(sw.w))))
    rig.pose.bones["lowerarm_twist_01_r"].rotation_quaternion = Quaternion(Vector((0, 1, 0)), math.radians(tw_angle * 0.5))
    # -------- head looks at ball (yaw/pitch shared between neck and head)
    bpy.context.view_layer.update()
    log.append({"f": f, "wrist_swing_deg": round(sw_angle, 1), "pronation_deg": round(tw_angle, 1)})
    for pb in rig.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=f)
    rig.pose.bones["Root"].keyframe_insert("location", frame=f)

print("FLIGHT takeoff", TAKEOFF, "land", land_f, "V0", round(V0, 2), "airtime_s", round(((land_f or 0) - TAKEOFF + 1) / FPS, 3))
# ------------------------------------------------------------------ ball
sc.frame_set(T["release"])
rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C)
Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Vector((0, 0, 1))).normalized()
if face_n.dot(N) < 0: face_n = -face_n
sweet = Rm @ Vector((0, 0.50, 0))
ball_c = sweet + face_n * 0.0335
dt = (C - T["release"]) / FPS
v = (ball_c - rel_p + Vector((0, 0, 0.5 * G * dt * dt))) / dt
apex = rel_p.z + v.z ** 2 / (2 * G)
print("TOSS apex_m", round(apex, 2), "apex_before_contact_s", round(dt - v.z / G, 3), "vz", round(v.z, 2), "face_n·N", round(face_n.dot(N), 2), "contact_z", round(ball_c.z, 2))
ball.parent = None
outv = (N * 0.97 + U * -0.06 + RT * 0.05).normalized() * 48.0
bp = {}
for f in frames:
    if f < T["release"]:
        sc.frame_set(f); p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
    elif f <= C:
        t = (f - T["release"]) / FPS; p = rel_p + v * t - Vector((0, 0, 0.5 * G * t * t))
    else:
        t = (f - C) / FPS; p = ball_c + outv * t - Vector((0, 0, 0.5 * G * t * t))
    ball.location = p; ball.keyframe_insert("location", frame=f); bp[f] = list(p)
for fc in ball.animation_data.action.fcurves if hasattr(ball.animation_data.action, "fcurves") else []:
    for k in fc.keyframe_points: k.interpolation = 'LINEAR'
sc.frame_start, sc.frame_end = T["start"], T["end"]
T["land"] = land_f; T["takeoff"] = TAKEOFF
json.dump({"T": T, "fps": FPS, "takeoff": TAKEOFF, "land": land_f, "v0_jump": V0, "toss_v": list(v), "toss_apex": apex,
           "contact_ball": list(ball_c), "face_normal": list(face_n), "ball": bp, "wrist": log},
          open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
ws = [l["wrist_swing_deg"] for l in log]; pr = [l["pronation_deg"] for l in log]
print("WRIST swing max", max(ws), "at", log[ws.index(max(ws))]["f"], "| pronation range", min(pr), max(pr))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED", len(frames))
