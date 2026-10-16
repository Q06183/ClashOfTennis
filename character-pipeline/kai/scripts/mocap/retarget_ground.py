"""Step 8: real mocap FOREHAND and TWO-HANDED BACKHAND retargeted onto Kai.

Source: Tennis-MoCap (Pulgarin-Giraldo et al. 2017, CC BY-SA 3.0), player jarua (male, right-handed).
  forehand : jarua_Derecha_18seg.bvh, stroke #3, 100 Hz contact frame 609 (right-wrist speed peak 9.7 m/s)
  backhand : jarua_Reves.bvh,        stroke #4, 100 Hz contact frame 757 (left-wrist  speed peak 8.6 m/s;
             wrists stay 13-20 cm apart through contact -> two-handed backhand).
Same retarget math as retarget_serve.py (segment directions real; hinge bend planes; root clearance).
Differences:
  * court frame built from the SWING velocity at contact (hips barely travel between repetitions),
    oriented so the hit goes toward the net (-Y) and the right hand stays on Kai's -X side;
  * groundstrokes stay planted: root vertical is a low-pass of the source hips path (no jump solve);
  * racket: forehand = right hand only, grip relaxed from continental toward semi-western;
            backhand = right hand drives the racket, LEFT hand placed on the upper handle by analytic IK,
            fingers of both hands wrap the grip during the stroke;
  * racket lag/whip: physical rod about the hitting forearm as in the serve, retuned for groundstroke timing;
  * ball: incoming along the court from the net side, square-face contact out to cross/down-the-line, then
    ballistic (the mocap itself contains no ball).
Outputs: kai_07_ground.blend + qa/ground_plan.json (both strokes), actions baked per frame.
"""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
sys.path.insert(0, "/Users/bytedance/Desktop/TennisClash/character-pipeline/kai/scripts")
sys.path.insert(0, "/Users/bytedance/Desktop/TennisClash/character-pipeline/kai/scripts/mocap")
from poselib import ROOT, reset, world_head, world_tail, two_bone_ik

FPS = 60; G = 9.81; PRE, POST = 1.30, 0.90
STROKES = {
    "Forehand": dict(file="jarua_Derecha_18seg.bvh", C=609, hit="Right", other="Left", twohanded=False),
    "Backhand": dict(file="jarua_Reves.bvh",        C=757, hit="Left",  other="Right", twohanded=True),
}
DATA = "/tmp/tennis-mocap/data"
from bvh_tools import parse_bvh, fk

def V(p): return Vector((p[0], p[1], p[2]))

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; ball = bpy.data.objects["Kai_Ball"]
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
sc = bpy.context.scene; sc.render.fps = FPS
for o in [o for o in bpy.data.objects if o.animation_data]: o.animation_data_clear()
reset(rig)
B = {b.name: b for b in rig.data.bones}
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
kai_h = 1.865

def base3(n):
    pb = rig.pose.bones[n]
    return (pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[n]) if pb.parent else REST[n]
def set_world3(n, R3):
    rig.pose.bones[n].rotation_quaternion = (base3(n).inverted() @ R3).to_quaternion()
def frame(up, lat):
    u = up.normalized(); l = (lat - lat.dot(u) * u).normalized()
    return Matrix((l, l.cross(u) * -1, u)).transposed()
UPRIGHT = frame(Vector((0, 0, 1)), Vector((1, 0, 0)))
def aim(n, d):
    b = base3(n); cur = (b @ Vector((0, 1, 0))).normalized()
    set_world3(n, cur.rotation_difference(d.normalized()).to_matrix() @ b)

HINGE_PREV = {}
def aim_hinge(nu, nl, du, dl, flex_dir):
    du = du.normalized(); dl = dl.normalized()
    a0 = (REST[nu] @ Vector((0, 1, 0))).normalized()
    h0 = a0.cross(flex_dir).normalized()
    h = du.cross(dl)
    prev = HINGE_PREV.get(nu)
    if h.length < 0.17:
        h = prev if prev is not None else h0
        h = (h - du * h.dot(du)).normalized()
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

GRIP_Q = {k: Quaternion(v) for k, v in GR["grip_q"].items()}
HOLD_Q = {k: Quaternion(v) for k, v in GR["hold_q"].items()}

# finger wrap for the non-hitting hand on a forehand (relaxed ready) and both hands on the two-hander.
# Left hand holding a racket above the right: mirror of the continental wrap around the grip (rough pose,
# tightened visually during review). Built from HOLD_Q (left ball-hold) rotated onto a vertical grip.
def left_grip_rotation():
    # hold_q was authored for holding a ball palm-up; rotate wrist/forearm basis onto the shaft.
    out = {}
    for k, q in HOLD_Q.items():
        out[k] = q
    return out
LEFT_GRIP_Q = left_grip_rotation()

def kai_sole_clear():
    out = []
    for s in ("l", "r"):
        a = world_head(rig, "foot_" + s).z - 0.077
        bz = world_head(rig, "ball_" + s).z - 0.009; tz = world_tail(rig, "ball_" + s).z - 0.014
        out.append(min(a, bz, tz))
    return min(out), out

def build_stroke(name, cfg):
    J, Fs, dt = parse_bvh(os.path.join(DATA, cfg["file"]))
    C_SRC = cfg["C"]
    f0, f1 = C_SRC - int(round(PRE / dt)), C_SRC + int(round(POST / dt))
    W = [fk(J, Fs[i]) for i in range(f0, f1 + 1)]
    iC = C_SRC - f0
    nF = int(round((PRE + POST) * FPS)) + 1
    C = 1 + int(round(PRE * FPS))

    # ---- court frame: swing velocity (horizontal) at contact -> -Y (into the court/net).
    # Canonical rotation (same as the serve pipeline): fwd_src->(0,-1,0), up->(0,0,1), fwd x up->+X.
    pA = V(W[iC - 3][cfg['hit'] + "Wrist"][0]); pB = V(W[iC + 3][cfg['hit'] + "Wrist"][0])
    vsw = pB - pA; vsw.y = 0; fwd_src = vsw.normalized()
    up_src = Vector((0, 1, 0)); side_src = fwd_src.cross(up_src).normalized()
    def build_R(sign):
        Ms = Matrix((side_src, up_src, fwd_src)).transposed()
        Md = Matrix((Vector((sign, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)))).transposed()
        return Md @ Ms.inverted()
    R_SD = build_R(-1.0)
    wc = W[iC]
    if (R_SD @ (V(wc["RightShoulder"][0]) - V(wc["LeftShoulder"][0]))).x > 0 or R_SD.determinant() < 0:
        R_SD = build_R(1.0)
    assert abs(R_SD.determinant() - 1) < 1e-6
    origin = V(W[0]["Hips"][0]); origin.y = 0
    def P(w, n): return R_SD @ ((V(w[n][0]) - origin) * 0.01)

    src_h = max(w["Head_End"][0][1] for w in W[:20]) * 0.01
    S = kai_h / src_h
    toe_floor = sorted(min(w["LeftAnkle_End"][0][1], w["RightAnkle_End"][0][1]) for w in W)[len(W)//20] * 0.01
    ank_floor = sorted(min(w["LeftAnkle"][0][1], w["RightAnkle"][0][1]) for w in W)[len(W)//20] * 0.01

    def sample(t):
        x = t / dt          # W already starts at C_SRC-PRE; t=0 is window start
        i = max(0, min(len(W) - 2, int(math.floor(x)))); u = x - i
        a, b = W[i], W[i + 1]
        return {k: ([a[k][0][j]*(1-u)+b[k][0][j]*u for j in range(3)], None) for k in a}

    foot_rest_src = {s: (R_SD @ V(next(j["offset"] for j in J if j["name"] == s+"Ankle_End"))).normalized()
                     for s in ("Left", "Right")}

    # start placement: midpoint of ankles near centre mark, ~0.4 m behind baseline
    w_first = sample(0.0)
    mid0 = (P(w_first, "LeftAnkle") + P(w_first, "RightAnkle")) * 0.5 * S
    OFFS = Vector((-0.05 - mid0.x, 0.40 - mid0.y, 0.0))

    # fresh action: clear pose keys from any previous stroke by rebuilding on a temp scene is heavy;
    # instead track everything for THIS stroke and key into its own NLA action later via rename trick:
    # bake first on current rig, assign action to name, clear before next stroke.
    if rig.animation_data: rig.animation_data_clear()
    rig.animation_data_create()
    act = bpy.data.actions.new(name); act.use_fake_user = True
    rig.animation_data.action = act
    if ball.animation_data: ball.animation_data_clear()
    ball.animation_data_create()
    ball_act = bpy.data.actions.new(name + "_Ball"); ball_act.use_fake_user = True
    ball.animation_data.action = ball_act

    HINGE_PREV.clear()
    ROOTPOS = {}; GRIPP = {}; FORE = {}
    pel_rest = B["pelvis"].head_local.copy()
    FWD, BACK = Vector((0,-1,0)), Vector((0,1,0))

    # smooth source hips height for planted root vertical (low-pass)
    hipsy = [P(W[i], "Hips").z for i in range(len(W))]
    def lp(seq, k=6):
        o = seq[:]
        for _ in range(k):
            o = [o[0]] + [0.25*o[i-1] + 0.5*o[i] + 0.25*o[i+1] for i in range(1, len(o)-1)] + [o[-1]]
        return o
    hipsy_s = lp(hipsy)

    # ---- backhand chest-heading targets (deg). 0 = chest faces the net (-Y); +90 = side-on (chest to the
    # hitter's left, +X); 180 = chest to the back fence (back to the net). The mocap two-hander coils to
    # ~210 (back fully to the net) - the "closed / facing backward" look. Target: coil no further than
    # side-on+20 (110), then at contact the chest is OPENED 50 deg from side-on toward the net (40).
    def chest_heading(wq):
        lat_ = P(wq, "LeftShoulder") - P(wq, "RightShoulder")
        upv = P(wq, "Neck") - P(wq, "Hips")
        fwv = lat_.normalized().cross(upv.normalized()); fwv.z = 0
        return math.degrees(math.atan2(fwv.x, -fwv.y))
    HU = {}; prev_h = None
    for kk_ in range(nF):
        h = chest_heading(sample(kk_ / FPS))
        if prev_h is not None:
            while h - prev_h > 180: h -= 360
            while h - prev_h < -180: h += 360
        HU[1 + kk_] = h; prev_h = h
    def sm(x): x = max(0.0, min(1.0, x)); return x*x*(3-2*x)
    BH_COIL_MAX, BH_CONTACT, BH_FOLLOW = 112.0, 40.0, 30.0
    def bh_target(f):
        hu = HU[f]; coil = min(hu, BH_COIL_MAX)
        if f <= C-40: return hu
        if f <= C-24: return hu + (coil - hu) * sm((f-(C-40))/16.0)
        # trunk opens EARLY (C-15..C-4) so its angular-speed peak leads the arm (proximal-to-distal)
        if f <= C-13: return coil
        if f <= C-2:
            c0 = min(HU[C-13], BH_COIL_MAX)
            return c0 + (BH_CONTACT - c0) * sm((f-(C-13))/11.0)
        if f <= C: return BH_CONTACT
        if f <= C+10: return BH_CONTACT + (BH_FOLLOW - BH_CONTACT) * sm((f-C)/10.0)
        if f <= C+40: return BH_FOLLOW + (hu - BH_FOLLOW) * sm((f-(C+10))/30.0)
        return hu
    if cfg["twohanded"]:
        print(f"[{name}] HEADING mocap@contact {HU[C]:.0f} -> {bh_target(C):.0f}; takeback max "
              f"{max(HU[f] for f in range(C-30, C-4)):.0f} -> {max(bh_target(f) for f in range(C-30, C-4)):.0f}")

    for k in range(nF):
        f = 1 + k; t = k / FPS
        sc.frame_set(f); reset(rig)
        w = sample(t)
        # groundstroke grip fingers: hitting hand wraps from the first frames (unitary take)
        for kk, q in GRIP_Q.items(): rig.pose.bones[kk].rotation_quaternion = q
        hips = P(w, "Hips") * S + OFFS
        root = rig.pose.bones["Root"]
        root.location = Vector((hips.x - pel_rest.x, hips.y - pel_rest.y, 0.0))
        bpy.context.view_layer.update()
        hipline = P(w, "LeftHip") - P(w, "RightHip"); shline = P(w, "LeftShoulder") - P(w, "RightShoulder")
        pel_up = P(w, "Chest") - P(w, "Hips"); ch_up = P(w, "Neck") - P(w, "Chest")
        hd_up = P(w, "Head_End") - P(w, "Neck")
        Fp = frame(pel_up, hipline); Fc = frame(ch_up, shline)
        qp = (Fp @ UPRIGHT.inverted()).to_quaternion(); qc = (Fc @ UPRIGHT.inverted()).to_quaternion()
        if qp.dot(qc) < 0: qc = -qc
        for nn, u in (("pelvis",0.0),("spine_01",0.33),("spine_02",0.66),("spine_03",1.0)):
            set_world3(nn, qp.slerp(qc,u).to_matrix() @ REST[nn]); bpy.context.view_layer.update()
        qh = (frame(hd_up, shline) @ UPRIGHT.inverted()).to_quaternion()
        if qh.dot(qc) < 0: qh = -qh
        # ---- stylisation pass: extra trunk yaw about world +Z (hips/feet keep the mocap stance).
        # forehand: MORE coil AWAY from the ball during the takeback (-Z yaw turns the right shoulder
        #           further back), fully unwound by contact;
        # backhand: OPEN the stance through contact so the chest points crosscourt (+X), not at the rear
        #           fence (+Z yaw), easing back after follow-through.
        def seg(x, a, b, va, vb):
            if x <= a: return va
            if x >= b: return vb
            t = (x-a)/(b-a); t = t*t*(3-2*t)
            return va + (vb-va)*t
        if not cfg["twohanded"]:
            yaw = (seg(f, C-34, C-14, 0.0, math.radians(-16))
                   + seg(f, C-14, C-4, math.radians(-16), 0.0)
                   + seg(f, C-4, C+30, 0.0, 0.0))
        else:
            # heading-targeted (see bh_target): correction = target - mocap chest heading
            yaw = math.radians(bh_target(f) - HU[f])
        def qpow(q, k):
            """fraction k of rotation q (mathutils.Quaternion has no ** operator)"""
            if abs(q.angle) < 1e-9: return Quaternion()
            return Quaternion(q.axis, q.angle * k)
        Qy = Quaternion(Vector((0,0,1)), yaw)
        bpy.context.view_layer.update()
        UPB = (("spine_02",0.139),("spine_03",0.216),("head",0.081),("clavicle_l",0.05),("clavicle_r",0.05))
        upb_before = sum((world_head(rig,nn)*m for nn,m in UPB), Vector()) * (1.0/sum(m for _,m in UPB))
        ymul = {"pelvis":0.35, "spine_01":0.55, "spine_02":0.8, "spine_03":1.0, "neck_01":0.9, "head":0.7}
        for nn, u in (("pelvis",0.0),("spine_01",0.33),("spine_02",0.66),("spine_03",1.0)):
            qb = qp.slerp(qc,u)
            set_world3(nn, qpow(Qy, ymul[nn]).to_matrix() @ qb.to_matrix() @ REST[nn]); bpy.context.view_layer.update()
        set_world3("neck_01", qpow(Qy, ymul["neck_01"]).to_matrix() @ qc.slerp(qh,0.5).to_matrix() @ REST["neck_01"]); bpy.context.view_layer.update()
        set_world3("head", qpow(Qy, ymul["head"]).to_matrix() @ qh.to_matrix() @ REST["head"]); bpy.context.view_layer.update()
        if cfg["twohanded"]:
            upb_after = sum((world_head(rig,nn)*m for nn,m in UPB), Vector()) * (1.0/sum(m for _,m in UPB))
            dcom = (upb_after - upb_before) * 0.9          # upper body + arms ~62% of body mass
            root.location.x -= dcom.x; root.location.y -= dcom.y
            bpy.context.view_layer.update()
        for nn, a, bn in (("clavicle_l","LeftCollar","LeftShoulder"),("clavicle_r","RightCollar","RightShoulder")):
            d = P(w,bn)-P(w,a); rest_d = REST[nn] @ Vector((0,1,0))
            el = math.asin(max(-1,min(1,d.normalized().z))); el0 = math.asin(max(-1,min(1,rest_d.normalized().z)))
            cur = (base3(nn) @ Vector((0,1,0))).normalized()
            ax = cur.cross(Vector((0,0,1)))
            if ax.length > 1e-6:
                set_world3(nn, Quaternion(ax.normalized(),(el-el0)*0.6).to_matrix() @ base3(nn))
            bpy.context.view_layer.update()
        for side, s_ in (("l","Left"),("r","Right")):
            aim_hinge("upperarm_"+side,"lowerarm_"+side,
                      P(w,s_+"Elbow")-P(w,s_+"Shoulder"), P(w,s_+"Wrist")-P(w,s_+"Elbow"), FWD)
            aim_hinge("thigh_"+side,"calf_"+side,
                      P(w,s_+"Knee")-P(w,s_+"Hip"), P(w,s_+"Ankle")-P(w,s_+"Knee"), BACK)
        # ---- takeback amplification: analytic IK stretches the hitting arm FURTHER BACK/UP ----
        # mocap takeback is compact (hand close to torso); a game-read forehand needs a visible loop.
        # Re-solve the right arm to an authored wrist target: behind the chest (+Y, away from the net),
        # raised to shoulder height. Window is smooth; mocap poses untouched outside [C-34, C-2].
        tb_a, tb_b, tb_deep, tb_c = C-34, C-13, C-6, C-2
        amp = 0.0
        if f < tb_c:
            if f > tb_a:
                if f < tb_b:
                    t=(f-tb_a)/(tb_b-tb_a); amp=t*t*(3-2*t)
                elif f <= tb_deep: amp = 1.0
                else:
                    t=(f-tb_deep)/(tb_c-tb_deep); amp=1.0-(t*t*(3-2*t))
        if amp > 0.001 and not cfg["twohanded"]:
            bpy.context.view_layer.update()
            wrist0 = world_head(rig, "hand_r")
            # chest backward = +Y (net is -Y); raise to shoulder line; bias slightly across the body
            target = wrist0 + Vector((-0.03*amp, 0.24*amp, 0.12*amp))
            # pole: two_bone_ik takes a DIRECTION (projected off the shoulder->target line), not a point.
            # Blend from the current mocap elbow direction toward the authored outward direction by amp,
            # so the first IK frame keeps the mocap bend plane (no single-frame arm flip).
            sh_r = world_head(rig, "upperarm_r")
            dir_now = world_tail(rig, "upperarm_r") - sh_r
            dir_auth = Vector((-0.55, -0.25, -0.10))
            pole_dir = dir_now.normalized().lerp(dir_auth.normalized(), amp)
            two_bone_ik(rig, "upperarm_r", "lowerarm_r", target, pole_dir)
            # counter arm reaches forward across the chest
            pb = rig.pose.bones["clavicle_l"]
            set_world3("clavicle_l",
                       Quaternion(Vector((0,0,1)), math.radians(-10*amp)).to_matrix() @ pb.matrix.to_3x3())
            bpy.context.view_layer.update()
        for s, side in (("l","Left"),("r","Right")):
            d = (P(w,side+"Ankle_End")-P(w,side+"Ankle")).normalized()
            heading = Vector((d.x,d.y,0)).normalized()
            pitch_src = math.asin(max(-1,min(1,d.z))) - math.asin(max(-1,min(1,foot_rest_src[side].z)))
            p = -math.radians(26.8) + pitch_src
            fd = heading*math.cos(p) + Vector((0,0,1))*math.sin(p)
            aim("foot_"+s, fd); bpy.context.view_layer.update()
            aim("ball_"+s, Vector((heading.x,heading.y,0.07+max(0,pitch_src)*0.3))); bpy.context.view_layer.update()
        # planted root vertical: keep soles on the floor
        _, per = kai_sole_clear()
        root.location.z += -min(per)
        bpy.context.view_layer.update()
        for pb in rig.pose.bones: pb.keyframe_insert("rotation_quaternion", frame=f)
        root.keyframe_insert("location", frame=f)
        GRIPP[f] = (racket.matrix_world @ Vector((0,0.075,0))).copy()
        FORE[f] = (world_tail(rig,"lowerarm_r")-world_head(rig,"lowerarm_r")).normalized()
        ROOTPOS[f] = root.location.copy()
    print(f"[{name}] pass1 body baked {nF} frames, contact {C}, scale {S:.3f}")
    return dict(cfg=cfg, W=W, sample=sample, P=P, R_SD=R_SD, S=S, nF=nF, C=C, act=act, ball_act=ball_act,
                GRIPP=GRIPP, FORE=FORE, ROOTPOS=ROOTPOS, C_SRC=C_SRC, dt=dt)

# ============================ pass 2: racket lag, hitting hand(s), ball, events =====================
def smooth_series(d, n=2):
    ks = sorted(d); vals = [d[k] for k in ks]
    for _ in range(n):
        vals = [vals[0]] + [(vals[i-1]+vals[i]*2+vals[i+1])*0.25 for i in range(1,len(vals)-1)] + [vals[-1]]
    return dict(zip(ks, vals))

def interp(d, x, nF):
    fl = max(1, min(nF-1, int(math.floor(x)))); u = max(0.0, min(1.0, x-fl))
    return d[fl].lerp(d[fl+1], u)

def simulate_rod(GP, FORE, nF, FPS, k_wrist, c_wrist, rom_deg=70.0):
    u = FORE[1].copy(); wv = Vector((0,0,0)); h = 1.0/(FPS*20)
    out = {1: u.copy()}; x = 1.0
    def accel(xx, hh=0.5):
        a = interp(GP, xx-hh, nF); b = interp(GP, xx, nF); c = interp(GP, xx+hh, nF)
        return (a - b*2 + c)/((hh/FPS)**2)
    while x < nF:
        d = interp(FORE, x, nF).normalized()
        g_eff = Vector((0,0,-G)) - accel(x)
        tau = (u*0.255).cross(g_eff*0.31) + u.cross(d)*k_wrist - wv*c_wrist
        ang = math.degrees(u.angle(d))
        if ang > rom_deg:
            tau += u.cross(d)*k_wrist*6.0*(ang-rom_deg)/10.0
        wv += tau/0.038*h
        wv -= u*wv.dot(u)
        u = (Quaternion(wv.normalized(), wv.length*h) @ u).normalized() if wv.length > 1e-9 else u
        x += h*FPS
        fi = int(round(x))
        if abs(x-fi) < h*FPS*0.5 and fi not in out: out[fi] = u.copy()
    for fi in range(1, nF+1):
        if fi not in out: out[fi] = out[max(k for k in out if k < fi)]
    return out

def tip_speed(rod, GP, nF, FPS, L=0.425):
    sp = {}
    for f in range(2, nF+1):
        sp[f] = (GP[f]+rod[f]*L - (GP[f-1]+rod[f-1]*L)).length*FPS
    return sp

def left_finger_curl(strength=0.85):
    qs = {}
    for grp in ("index","middle","ring","pinky"):
        for seg, deg in (("01",55),("02",70),("03",45)):
            qs[f"{grp}_{seg}_l"] = Quaternion(Vector((1,0,0)), math.radians(deg*strength))
    for seg, deg in (("01",25),("02",40),("03",30)):
        qs[f"thumb_{seg}_l"] = (Quaternion(Vector((0,0,1)), math.radians(-35*strength))
                                @ Quaternion(Vector((1,0,0)), math.radians(deg*strength)))
    return qs

def clamp_wrist(pbH, Hd, max_swing_deg=85.0):
    side = pbH.name.split("_")[1]
    pbF = rig.pose.bones["lowerarm_"+side]
    baseH = pbF.matrix.to_3x3() @ REST["lowerarm_"+side].inverted() @ REST[pbH.name]
    q_rel = (baseH.inverted() @ Hd).to_quaternion()
    vq = Vector((q_rel.x, q_rel.y, q_rel.z)); proj = Vector((0,1,0))*vq.y
    tw = Quaternion((q_rel.w, proj.x, proj.y, proj.z)); tw = tw.normalized() if tw.magnitude > 1e-9 else Quaternion()
    sw = q_rel @ tw.inverted()
    sw_ang = 2*math.acos(min(1.0, abs(sw.w)))
    if sw_ang > math.radians(max_swing_deg):
        ax = Vector((sw.x,sw.y,sw.z)).normalized()*(1 if sw.w >= 0 else -1)
        sw = Quaternion(ax, math.radians(max_swing_deg))
    tw_ang = (2*math.atan2(tw.y, tw.w) + math.pi) % (2*math.pi) - math.pi
    tw_c = max(math.radians(-100), min(math.radians(100), tw_ang))
    pbH.rotation_quaternion = sw @ Quaternion(Vector((0,1,0)), tw_c)
    return sw_ang, tw_c

def slerp_dirs(a, b, w):
    return a.slerp(b, max(0.0, min(1.0, w))).normalized()

def finish_stroke(name, Rn):
    """Biomechanics-authored racket shaft on the REAL mocap grip path.
    Phase keys (world): ready (racket held in front) -> takeback (head back/up) -> deepest lag
    (head behind and below wrist, butt cap to the ball) -> whip release (ease-in, max angular speed
    at contact) -> follow-through aligned with the mocap forearm. Face edge-on -> square by contact,
    parallel-transported after (zero self-roll)."""
    cfg = Rn["cfg"]; nF, C = Rn["nF"], Rn["C"]
    two = cfg["twohanded"]
    GP = smooth_series(Rn["GRIPP"], 2); FORE = Rn["FORE"]
    print(f"[{name}] authored-shaft racket on mocap grip path")

    out_dir = Vector((-0.18,-0.98,0.04)).normalized() if not two else Vector((0.20,-0.97,0.03)).normalized()
    fwd = Vector((out_dir.x, out_dir.y, 0)).normalized()
    lat = Vector((0,0,1)).cross(fwd).normalized()          # +X side
    lat_sign = -1.0 if not two else 0.6                    # forehand head lags on hitter's (right) side
    # ---- shaft direction key frames. u_ready follows the mocap forearm at rest (racket held with both
    # hands in front, no wrist bend) instead of an authored raised position.
    sc.frame_set(1)
    u_ready0 = (world_tail(rig, "lowerarm_r") - world_head(rig, "lowerarm_r")).normalized()
    ready_lat = -0.35 if not two else 0.0       # forehand: ready racket clear on the hitter's own side
    u_ready = (fwd*0.62 + Vector((0,0,1))*0.55 + lat*ready_lat*0.4).normalized()
    u_takeback = (fwd*(-0.95) + Vector((0,0,1))*0.34 + lat*lat_sign*0.34).normalized() if not two \
                 else (fwd*(-0.70) + Vector((0,0,1))*0.62 + lat*lat_sign*0.20).normalized()
    u_deep    = (fwd*(-0.90) + Vector((0,0,1))*(-0.34) + lat*lat_sign*0.16).normalized() if not two \
                else (fwd*(-0.97) + Vector((0,0,1))*(0.02) + lat*0.42).normalized()   # two-hander lag: head back, high and wide of the left thigh
    # contact: aim the sweet spot at an explicit waist-height point in front of the grip (built from the
    # real grip path so contact geometry is exact regardless of the mocap wrist height)
    z_sweet = 0.95 if not two else 1.00
    fwd_d = 0.46 if not two else 0.36
    target_sweet = GP[C] + fwd*fwd_d + Vector((0,0, z_sweet - GP[C].z)) + lat*((-0.05) if not two else 0.03)
    u_contact = (target_sweet - GP[C]).normalized()
    f_raise = C - 30; f_tb = C - 16; f_deep = C - 6; f_follow = C + 12
    u_finish_key = FORE[min(nF, f_follow)].normalized()

    def shaft_raw(f):
        if f <= f_raise:
            return u_ready
        if f < f_tb:
            return slerp_dirs(u_ready, u_takeback, (f-f_raise)/((f_tb-f_raise) or 1))
        if f < f_deep:
            return slerp_dirs(u_takeback, u_deep, (f-f_tb)/((f_deep-f_tb) or 1))
        if f <= C:
            t = (f-f_deep)/((C-f_deep) or 1)
            t = t*t                                                  # ease-IN: whip peaks at contact
            return slerp_dirs(u_deep, u_contact, t)
        if f <= f_follow:
            return slerp_dirs(u_contact, u_finish_key, (f-C)/((f_follow-C) or 1))
        return slerp_dirs(u_finish_key, FORE[min(nF,max(1,f))].normalized(),
                         min(1.0, (f-f_follow)/10.0))

    # idle (before the unit turn): shaft follows the mocap hitting forearm (zero wrist bend); ease into
    # the authored shaft by f_raise so the wait/ready never strains the wrist or pokes the body.
    f_unit = C - 34
    def shaft(f):
        u_auth = shaft_raw(f)
        if f >= f_raise:
            return u_auth
        # idle: racket held up in front (half-way between the forearm and the ready shaft), never hanging
        # along the forearm into the thigh
        idle = slerp_dirs(FORE[f].normalized(), u_ready, 0.5)
        if f <= f_unit:
            return idle
        w = (f-f_unit)/((f_raise-f_unit) or 1); w = w*w*(3-2*w)
        return slerp_dirs(idle, u_auth, w)

    # face normal keys
    n_contact = out_dir.normalized()
    edge_n = (lat * (-lat_sign)).normalized()        # edge-on face points across the body at takeback
    def normal(f, u):
        if f >= C:
            q = u_contact.rotation_difference(u)     # parallel transport with the shaft path
            return (q @ n_contact - u*(q @ n_contact).dot(u)).normalized()
        if f <= C-5:
            return edge_n
        w = (f-(C-5))/5.0; w = w*w*(3-2*w)
        return slerp_dirs(edge_n, n_contact, w)

    H_rest_r = (rig.matrix_world @ rig.pose.bones["hand_r"].matrix).to_3x3()
    R_rest = racket.matrix_world.to_3x3()
    HF_R0 = R_rest.inverted() @ H_rest_r
    LEFT_Q = left_finger_curl()
    U = {f: shaft(f) for f in range(1, nF+1)}
    if two:
        # search the grip roll bias that keeps the right wrist inside ROM through the swing window
        def swing_for(bias_deg):
            HFt = Quaternion(Vector((0,1,0)), math.radians(bias_deg)).to_matrix() @ HF_R0
            worst = 0.0; worst_f = None
            for f in range(f_tb, f_follow+1):
                u = U[f]; nn = normal(f, u); nn = (nn - u*nn.dot(u)).normalized()
                Rr = Matrix((u.cross(nn).normalized(), u, nn)).transposed()
                sc.frame_set(f); bpy.context.view_layer.update()
                pbH, pbF = rig.pose.bones["hand_r"], rig.pose.bones["lowerarm_r"]
                baseH = pbF.matrix.to_3x3() @ REST["lowerarm_r"].inverted() @ REST["hand_r"]
                q_rel = (baseH.inverted() @ (Rr @ HFt)).to_quaternion()
                vq = Vector((q_rel.x, q_rel.y, q_rel.z)); proj = Vector((0,1,0))*vq.y
                tw = Quaternion((q_rel.w, proj.x, proj.y, proj.z))
                if tw.magnitude > 1e-9: tw.normalize()
                sw = q_rel @ tw.inverted()
                a = math.degrees(2*math.acos(min(1.0, abs(sw.w))))
                if a > worst: worst, worst_f = a, f
            return worst, worst_f
        cand = []
        for bias_deg in range(-180, 1, 4):
            cand.append((swing_for(bias_deg)[0], bias_deg))
        best_max, best_bias = min(cand, key=lambda t: t[0])
        HF_R = Quaternion(Vector((0,1,0)), math.radians(best_bias)).to_matrix() @ HF_R0
        dbg_at_C = swing_for(best_bias)
        print(f"[{name}] two-hander grip roll bias {best_bias} deg -> measured max swing {best_max:.0f} at f{dbg_at_C[1]}")
    else:
        HF_R = HF_R0
    wrist_log = {}
    ballP = {}
    BAKED_HW, BAKED_FORE = {}, {}
    for f in range(1, nF+1):
        sc.frame_set(f)
        u = U[f]; n = normal(f, u); n = (n - u*n.dot(u)).normalized()
        Rr = Matrix((u.cross(n).normalized(), u, n)).transposed()
        sw_ang, tw_c = clamp_wrist(rig.pose.bones["hand_r"], Rr @ HF_R)
        wrist_log[f] = (round(math.degrees(sw_ang),1), round(math.degrees(tw_c),1))
        rig.pose.bones["lowerarm_twist_01_r"].rotation_quaternion = Quaternion()
        if two:
            pbHl = rig.pose.bones["hand_l"]
            baseL = (rig.pose.bones["lowerarm_l"].matrix.to_3x3()
                     @ REST["lowerarm_l"].inverted() @ REST["hand_l"])
            cur_y = (baseL @ Vector((0,1,0))).normalized()
            qaim = cur_y.rotation_difference((-u*0.85 + Vector((0,0,-0.15))).normalized())
            if qaim.angle > math.radians(55):
                qaim = Quaternion(qaim.axis.normalized(), math.radians(55))
            pbHl.rotation_quaternion = qaim
            for kk, qq in LEFT_Q.items(): rig.pose.bones[kk].rotation_quaternion = qq
        else:
            for kk in HOLD_Q:
                rig.pose.bones[kk].rotation_quaternion = HOLD_Q[kk].slerp(Quaternion(), 0.55)
        bpy.context.view_layer.update()
        BAKED_HW[f] = (rig.pose.bones["hand_r"].matrix.to_3x3()).copy()
        BAKED_FORE[f] = (rig.pose.bones["lowerarm_r"].matrix.to_3x3()).copy()
        rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
        rig.pose.bones["lowerarm_twist_01_r"].keyframe_insert("rotation_quaternion", frame=f)
        if two:
            rig.pose.bones["hand_l"].keyframe_insert("rotation_quaternion", frame=f)
            for kk in LEFT_Q: rig.pose.bones[kk].keyframe_insert("rotation_quaternion", frame=f)
        else:
            for kk in HOLD_Q: rig.pose.bones[kk].keyframe_insert("rotation_quaternion", frame=f)

    # ---- smooth the hand swing along the moving forearm (removes clamp-boundary 4000 deg/s axis spikes).
    # Relative wrist rotations are Gaussian-smoothed in swing/twist split; contact frame is held exactly.
    rel = {}
    for f in range(1, nF+1):
        baseF = BAKED_FORE[f] @ REST["lowerarm_r"].inverted() @ REST["hand_r"]
        rel[f] = (baseF.inverted() @ BAKED_HW[f]).to_quaternion()
    def gauss_sigma(f):
        return 0.0 if f == C else (1.2 if abs(f-C) <= 2 else 2.0)
    def gsmooth(kernel, sigma):
        if sigma <= 0: return kernel
        r = 5
        w = [math.exp(-((i)**2)/(2*sigma*sigma)) for i in range(-r, r+1)]
        sw = sum(w)
        out = kernel.copy()
        for f in range(1, nF+1):
            if f == C: continue
            acc = Quaternion(); wsum = 0.0
            for i, ww in zip(range(-r, r+1), w):
                g = min(nF, max(1, f+i))
                q = kernel[g]
                if acc.dot(q) < 0: q = -q
                acc += q*ww; wsum += ww
            out[f] = (acc * (1.0/wsum)).normalized()
        return out
    # iterate: smooth rel rotations at fixed sigma=1.6, then re-solve and re-measure, until axis spikes gone
    for it in range(4):
        rel = gsmooth(rel, 1.6)
        for f in range(1, nF+1):
            if f != C: rel[f] = rel[f].normalized()
        # rebake
        for f in range(1, nF+1):
            sc.frame_set(f)
            q = rel[f]
            rig.pose.bones["hand_r"].rotation_quaternion = q
            bpy.context.view_layer.update()
            BAKED_HW[f] = (rig.pose.bones["hand_r"].matrix.to_3x3()).copy()
            rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
        # recompute relative after hierarchy update
        for f in range(1, nF+1):
            sc.frame_set(f)
            pbF = rig.pose.bones["lowerarm_r"]
            baseF = pbF.matrix.to_3x3() @ REST["lowerarm_r"].inverted() @ REST["hand_r"]
            rel[f] = (baseF.inverted() @ rig.pose.bones["hand_r"].matrix.to_3x3()).to_quaternion()
        # measure racket axis angular speed spikes
        ax = []
        for f in range(1, nF+1):
            sc.frame_set(f)
            ax.append((racket.matrix_world.to_3x3() @ Vector((0,1,0))).normalized())
        spike = max((math.degrees(ax[i-1].angle(ax[i]))*FPS, i+1) for i in range(1, len(ax)))
        print(f"[{name}] hand smooth it{it}: max axis angular speed {spike[0]:.0f} deg/s at f{spike[1]}")
        if spike[0] < 1500: break

    # tip speed from grip + authored shaft
    sp = {1: 0.0}
    for f in range(2, nF+1):
        a = GP[f-1] + U[f-1]*0.425; b = GP[f] + U[f]*0.425
        sp[f] = (b-a).length*FPS
    pk = max(range(C-8, C+5), key=lambda f: sp[f])
    print(f"[{name}] tip speed peak {sp[pk]:.1f} m/s at f{pk} (contact {C}), at contact {sp[C]:.1f}; "
          f"wrist max swing {max(v[0] for v in wrist_log.values()):.0f} deg")

    # ball: contact at the ACTUAL racket pose; incoming from net side waist-high, outgoing crosscourt
    sc.frame_set(C)
    Rm = racket.matrix_world
    sweet = Rm @ Vector((0,0.50,0))
    face_n = (Rm.to_3x3() @ Vector((0,0,1))).normalized()
    if face_n.dot(out_dir) < 0: face_n = -face_n
    ball_c = sweet + face_n*0.0335
    vin = Vector((0.02, 7.5, 0.0)).normalized()*13.0; vin = Vector((vin.x, abs(vin.y), vin.z))
    vout = out_dir*31.0 + Vector((0,0,2.2))
    for f in range(1, nF+1):
        if f < C:
            tt = (f-C)/FPS; pos = ball_c + vin*tt - Vector((0,0,0.5*G*tt*tt))
        elif f == C:
            pos = ball_c
        else:
            tt = (f-C)/FPS; pos = ball_c + vout*tt - Vector((0,0,0.5*G*tt*tt))
        ball.location = pos; ball.keyframe_insert("location", frame=f); ballP[f] = list(pos)

    tb_best = f_tb
    T = dict(ready=1, uniturn=C-34, takeback=tb_best, deep=f_deep, forward=C-8, contact=C, follow=C+10,
             finish=min(nF, C+34), end=nF)
    plan = dict(T=T, fps=FPS, contact_ball=list(ball_c), face_normal=list(face_n),
                out_velocity=list(vout), ball=ballP,
                shaft=dict(tip_speed_peak=round(sp[pk],2), tip_speed_peak_frame=pk,
                           tip_speed_at_contact=round(sp[C],2),
                           wrist_max_swing_deg=max(v[0] for v in wrist_log.values())),
                source=dict(dataset="Tennis-MoCap (Pulgarin-Giraldo et al. 2017)", license="CC BY-SA 3.0",
                            url="https://github.com/jdpulgarin/Tennis-MoCap", file=cfg["file"],
                            contact_frame_100hz=Rn["C_SRC"], two_handed=two,
                            player_level="high performance, male, right-handed", scale=round(Rn["S"],3)))
    sc.frame_start, sc.frame_end = 1, nF
    print(f"[{name}] contact ball", [round(x,2) for x in ball_c], "events", T)
    return plan

PLANS = {nm: finish_stroke(nm, build_stroke(nm, STROKES[nm])) for nm in ("Forehand","Backhand")}
json.dump(PLANS, open(os.path.join(ROOT,"qa","ground_plan.json"),"w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,"kai_07_ground.blend"))
print("SAVED kai_07_ground.blend")
