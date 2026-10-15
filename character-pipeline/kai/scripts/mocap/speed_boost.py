"""Contact racket-speed calibration.
After the whip pass the racket peak is one frame-exact but 34.8 m/s, 0.2 below the 35 m/s pro lower bound.
This adds a short angular bump to the racket about the swing axis u x (u x g) (the direction that points the
sweet-spot velocity along its path), centred on contact: dtheta(t) = A*t*exp(-t^2/2sigma^2), whose rate peaks
at t=0 and contributes A*r/sigma to the contact speed.  Split 40/60 between lower-arm and hand so the wrist
swing stays <= 80 deg.  Face-square at contact is preserved (the bump axis is perpendicular to the face normal
change that pronation handles).  Then the ball contact is re-solved.  Target peak 38 m/s (middle of 35-50)."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT
G = 9.81; FPS = 60; TARGET = 38.0; SIG = 0.030
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; ball = bpy.data.objects["Kai_Ball"]
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]; C = T["contact"]; R_ = T["release"]
GR = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
sc = bpy.context.scene; nF = sc.frame_end; N = Vector((0, -1, 0))
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
qH0 = {}; qF0 = {}
for f in range(1, nF + 1):
    sc.frame_set(f)
    qH0[f] = rig.pose.bones["hand_r"].rotation_quaternion.copy()
    qF0[f] = rig.pose.bones["lowerarm_r"].rotation_quaternion.copy()
def sweep_radius():
    a = racket.matrix_world @ Vector((0, 0.5, 0))
    g = (rig.matrix_world.to_3x3() @ rig.pose.bones["lowerarm_r"].matrix.to_3x3()) @ Vector((0, 1, 0))
    return (a - (rig.matrix_world @ rig.pose.bones["lowerarm_r"].matrix).translation).length, g.normalized()
def axis(f):
    u = (racket.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized()
    d = u.dot(N); face = u.cross(N)
    # swing axis = u x (target velocity - wrist velocity) ~ u x (-N-plane tangent): use u x face-adjusted
    v = u.cross(Vector((0, 0, 1))).normalized() if abs(d) > 0.85 else u.cross(N).normalized()
    return v.normalized()
def base3(pb):
    return (pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[pb.name])
def local_delta(pb, axw, ang):
    sc_frame_ax = base3(pb).inverted() @ axw
    return Quaternion(sc_frame_ax, ang)
def set_boost(f, A):
    t = (f - C) / FPS
    if abs(t) > 4 * SIG:
        sc.frame_set(f); rig.pose.bones["hand_r"].rotation_quaternion = qH0[f]; rig.pose.bones["lowerarm_r"].rotation_quaternion = qF0[f]; return
    dth = A * t * math.exp(-t * t / (2 * SIG * SIG))        # radians accumulated
    sc.frame_set(f)
    ax = axis(f)
    pbH, pbF = rig.pose.bones["hand_r"], rig.pose.bones["lowerarm_r"]
    pbH.rotation_quaternion = local_delta(pbH, ax, dth * 0.6) @ qH0[f]
    pbF.rotation_quaternion = local_delta(pbF, ax, dth * 0.4) @ qF0[f]
def speeds():
    # single sequential pass: frame_set resets from fcurves, so the override must be applied AFTER it and read immediately
    sp = {}; prev = None
    for f in range(C - 8, C + 7):
        set_boost(f, A_CUR); bpy.context.view_layer.update(); p = racket.matrix_world @ Vector((0, 0.5, 0))
        if prev is not None: sp[f] = (p - prev).length * FPS
        prev = p
    return sp
def wrist_swing():
    out = 0
    for f in range(C - 8, C + 7):
        sc.frame_set(f); q = rig.pose.bones["hand_r"].rotation_quaternion
        t = Quaternion((q.w, 0, q.y, 0)); t.normalize(); sw = q @ t.inverted()
        out = max(out, math.degrees(2 * math.acos(min(1.0, abs(sw.w)))))
    return out
def face_sq():
    sc.frame_set(C); n = (racket.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
    return abs(n.dot(N))
A_CUR = 0.0
best = None
for A in [x / 10 for x in range(0, 201, 2)]:
    A_CUR = A
    sp = speeds(); pk = max(sp, key=sp.get); ws = wrist_swing(); fs = face_sq()
    if ws > 80 or fs < 0.985 or not (C <= pk <= C + 1) or sp[pk] < 36: continue
    score = abs(sp[pk] - TARGET)
    if best is None or score < best[0]: best = (score, A, sp[pk], pk, ws, fs)
if best is None:
    raise SystemExit("no valid boost found")
_, A, v, pk, ws, fs = best
print(f"BOOST A={A:.1f} rad/s-equivalent -> peak {v:.1f} m/s at {pk} wrist_swing {ws:.0f} deg face·net {fs:.3f}")
for f in range(1, nF + 1):
    set_boost(f, A); bpy.context.view_layer.update()
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
    rig.pose.bones["lowerarm_r"].keyframe_insert("rotation_quaternion", frame=f)
# re-solve the ball onto the new sweet spot
sc.frame_set(R_); rel_p = (rig.matrix_world @ rig.pose.bones["hand_l"].matrix) @ Vector(GR["ball_in_hand_local"])
sc.frame_set(C); Rm = racket.matrix_world
face_n = (Rm.to_3x3() @ Vector((0, 0, 1))).normalized()
if face_n.dot(N) < 0: face_n = -face_n
sweet = Rm @ Vector((0, 0.50, 0)); ball_c = sweet + face_n * 0.0335
tf = (C - R_) / FPS; vb = (ball_c - rel_p + Vector((0, 0, 0.5 * G * tf * tf))) / tf
apex = rel_p.z + max(0, vb.z) ** 2 / (2 * G)
print(f"BALL contact_z={ball_c.z:.2f} face·net={face_n.dot(N):.3f} apex={apex:.2f}")
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
             "speed_boost": {"A": A, "sigma": SIG, "v_peak": v, "peak_frame": pk, "wrist_swing_deg": ws}})
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
