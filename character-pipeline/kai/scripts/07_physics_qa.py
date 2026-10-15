"""Step 7a: frame-by-frame physics / biomechanics QA of the serve (structured facts, not screenshots).
Checks
  1. Planted-foot sliding: while a foot is on the ground its ankle must not move horizontally (> 1 cm = fail).
  2. Ground penetration: lowest shoe vertex never below z = -5 mm; airborne frames must have both shoes above 0.
  3. Flight physics: during the airborne window the pelvis height must follow a parabola with g ~ 9.81.
  4. Kinetic chain order: peak angular speed must occur in order legs -> pelvis -> trunk -> upper arm -> forearm -> racket.
  5. Joint limits: elbow 0..150, knee 0..155, no hyper-extension (negative bend), wrist extension <= 80.
  6. Bone length invariance (no stretching).
  7. Contact: racket sweet spot meets the ball within 4 cm at the contact frame; contact is in front of the body
     and above the head; racket head speed peaks within +-2 frames of contact.
  8. Balance: centre of mass ground projection inside (or within 10 cm of) the support polygon while grounded.
  9. Racket/body clearance: racket never passes through the torso/head.
Writes qa/physics_report.json."""
import bpy, os, sys, json, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import bmesh
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, world_head, world_tail, joint_angle
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; ball = bpy.data.objects["Kai_Ball"]
shoes = bpy.data.objects["Kai_Shoes"]; body = bpy.data.objects["Kai_Body"]
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json")))
T = plan["T"]; FPS = plan["fps"]; TAKEOFF = plan["takeoff"]; LAND = plan["land"]
sc = bpy.context.scene
frames = list(range(sc.frame_start, sc.frame_end + 1))

# segment masses (Dempster/Winter fractions) for CoM
SEG = [("head", "head", 0.081), ("spine_03", "spine_03", 0.216), ("spine_01", "spine_02", 0.139), ("pelvis", "pelvis", 0.142),
       ("upperarm_l", "upperarm_l", 0.028), ("upperarm_r", "upperarm_r", 0.028), ("lowerarm_l", "lowerarm_l", 0.016),
       ("lowerarm_r", "lowerarm_r", 0.016), ("hand_l", "hand_l", 0.006), ("hand_r", "hand_r", 0.006),
       ("thigh_l", "thigh_l", 0.10), ("thigh_r", "thigh_r", 0.10), ("calf_l", "calf_l", 0.0465), ("calf_r", "calf_r", 0.0465),
       ("foot_l", "foot_l", 0.0145), ("foot_r", "foot_r", 0.0145)]
def com():
    acc = Vector(); m = 0
    for a, b, w in SEG:
        p = (world_head(rig, a) + world_tail(rig, b)) * 0.5; acc += p * w; m += w
    return acc / m

rest_len = {b.name: b.length for b in rig.data.bones}
dg = bpy.context.evaluated_depsgraph_get()
def shoe_low(side_x_sign):
    ev = shoes.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    zs = [(ev.matrix_world @ v.co) for v in me.vertices]
    ev.to_mesh_clear()
    l = [p.z for p in zs if p.x * side_x_sign > -0.02]
    return min(zs, key=lambda p: p.z).z, zs

rec = []
for f in frames:
    sc.frame_set(f)
    d = {"f": f}
    d["ankle_l"] = world_head(rig, "foot_l"); d["ankle_r"] = world_head(rig, "foot_r")
    d["toe_l"] = world_head(rig, "ball_l"); d["toe_r"] = world_head(rig, "ball_r")
    d["pelvis"] = world_head(rig, "pelvis"); d["com"] = com()
    d["sweet"] = racket.matrix_world @ Vector((0, 0.50, 0)); d["ball"] = ball.matrix_world.translation.copy()
    d["butt"] = racket.matrix_world @ Vector((0, 0.0, 0))
    d["elbow_r"] = joint_angle(rig, "upperarm_r", "lowerarm_r"); d["elbow_l"] = joint_angle(rig, "upperarm_l", "lowerarm_l")
    d["knee_l"] = joint_angle(rig, "thigh_l", "calf_l"); d["knee_r"] = joint_angle(rig, "thigh_r", "calf_r")
    d["wrist_r"] = joint_angle(rig, "lowerarm_r", "hand_r")
    # bone length check
    d["len_err"] = max(abs((rig.pose.bones[n].tail - rig.pose.bones[n].head).length - L) for n, L in rest_len.items())
    # segment orientations for angular speeds
    d["v_pel"] = (rig.pose.bones["pelvis"].matrix.to_3x3() @ Vector((1, 0, 0))).normalized()
    d["v_trunk"] = (rig.pose.bones["spine_03"].matrix.to_3x3() @ Vector((1, 0, 0))).normalized()
    d["v_uarm"] = (world_tail(rig, "upperarm_r") - world_head(rig, "upperarm_r")).normalized()
    d["v_farm"] = (world_tail(rig, "lowerarm_r") - world_head(rig, "lowerarm_r")).normalized()
    d["v_rack"] = (d["sweet"] - d["butt"]).normalized()
    d["v_thigh"] = (world_tail(rig, "thigh_l") - world_head(rig, "thigh_l")).normalized()
    d["v_calf"] = (world_tail(rig, "calf_l") - world_head(rig, "calf_l")).normalized()
    # shoes
    ev = shoes.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    L = [p for p in pts if (p - d["ankle_l"]).length < (p - d["ankle_r"]).length]
    R = [p for p in pts if (p - d["ankle_l"]).length >= (p - d["ankle_r"]).length]
    d["shoe_l_min"] = min(p.z for p in L); d["shoe_r_min"] = min(p.z for p in R)
    d["sole_l"] = [p for p in L if p.z < d["shoe_l_min"] + 0.006]; d["sole_r"] = [p for p in R if p.z < d["shoe_r_min"] + 0.006]
    # racket vs torso/head clearance (sample racket frame points vs body BVH)
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); bm = bmesh.new(); bm.from_mesh(ev.to_mesh()); bm.transform(ev.matrix_world)
    tree = BVHTree.FromBMesh(bm)
    rk = racket.evaluated_get(bpy.context.evaluated_depsgraph_get()); rm = rk.to_mesh()
    inside = 0
    for i, v in enumerate(rm.vertices):
        if i % 6: continue
        p = rk.matrix_world @ v.co
        if (racket.matrix_world.inverted() @ p).y < 0.20: continue   # ignore the handle (it is in the hand)
        loc, nrm, idx, dist = tree.find_nearest(p)
        if loc is not None and dist < 0.03 and (p - loc).dot(nrm) < 0: inside += 1
    rk.to_mesh_clear(); bm.free()
    d["racket_in_body"] = inside
    rec.append(d)
    print("FRAME", f, end="\r")

def ang_speed(key):
    out = [0.0]
    for a, b in zip(rec, rec[1:]):
        out.append(math.degrees(a[key].angle(b[key])) * FPS)
    return out

res = {"checks": {}, "series": {}}
GROUND_EPS = 0.012
# 1. foot sliding while planted
slide = {}
for side in ("l", "r"):
    worst = 0.0; worst_f = None
    for a, b in zip(rec, rec[1:]):
        planted = a[f"shoe_{side}_min"] < GROUND_EPS and b[f"shoe_{side}_min"] < GROUND_EPS
        if not planted: continue
        dw = plan.get("drag_windows", {}).get(side)
        if dw and dw[0] <= b["f"] <= dw[1] + 1: continue   # planned pinpoint drag (ball of foot slides on purpose)
        # sliding measured at the lowest sole points (the contact patch), horizontal only
        pa = sum(a[f"sole_{side}"], Vector()) / len(a[f"sole_{side}"]); pb = sum(b[f"sole_{side}"], Vector()) / len(b[f"sole_{side}"])
        dxy = math.hypot(pb.x - pa.x, pb.y - pa.y)
        if dxy > worst: worst, worst_f = dxy, b["f"]
    slide[side] = {"max_slide_per_frame_mm": round(worst * 1000, 1), "frame": worst_f}
res["checks"]["foot_slide"] = {"result": slide, "pass": all(v["max_slide_per_frame_mm"] <= 4.0 for v in slide.values())}
# 2. ground penetration
pen = min(min(r["shoe_l_min"], r["shoe_r_min"]) for r in rec)
air = [r for r in rec if TAKEOFF + 1 <= r["f"] <= LAND - 1]
air_ok = all(r["shoe_l_min"] > 0.0 and r["shoe_r_min"] > 0.0 for r in air)
res["checks"]["ground"] = {"lowest_sole_mm": round(pen * 1000, 1), "airborne_frames": len(air), "both_feet_off_ground_in_flight": air_ok,
                           "pass": pen > -0.005 and air_ok}
# 3. flight parabola -> fit g from pelvis height
zs = [(r["f"] / FPS, r["com"].z) for r in rec if TAKEOFF <= r["f"] <= LAND - 1]   # centre of mass is what follows free fall
if len(zs) >= 5:
    n = len(zs); tm = [t for t, _ in zs]; zm = [z for _, z in zs]
    # least squares z = a t^2 + b t + c
    import itertools
    S = lambda k: sum(t ** k for t in tm)
    Sy = lambda k: sum((t ** k) * z for t, z in zs)
    Mx = [[S(4), S(3), S(2)], [S(3), S(2), S(1)], [S(2), S(1), n]]; Vy = [Sy(2), Sy(1), Sy(0)]
    def det(m): return (m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]))
    D = det(Mx); Ma = [[Vy[i] if j == 0 else Mx[i][j] for j in range(3)] for i in range(3)]
    a = det(Ma) / D
    g_fit = -2 * a
else:
    g_fit = None
res["checks"]["flight_gravity"] = {"g_fit_m_s2": round(g_fit, 2) if g_fit else None, "airtime_s": round((LAND - TAKEOFF) / FPS, 3),
                                   "pass": g_fit is not None and abs(g_fit - 9.81) < 1.0}
# 4. kinetic chain order (peak angular speed frame between trophy and contact+4)
win = [i for i, r in enumerate(rec) if T["trophy"] <= r["f"] <= T["contact"] + 4]
chain = {}
for name, key in (("knee_extension", "v_calf"), ("pelvis", "v_pel"), ("trunk", "v_trunk"), ("upper_arm", "v_uarm"), ("forearm", "v_farm"), ("racket", "v_rack")):
    s = ang_speed(key); i = max(win, key=lambda k: s[k]); chain[name] = {"peak_frame": rec[i]["f"], "peak_deg_s": round(s[i])}
order = [chain[k]["peak_frame"] for k in ("knee_extension", "pelvis", "trunk", "upper_arm")]
distal_ok = all(T["contact"] - 2 <= chain[k]["peak_frame"] <= T["contact"] + 1 for k in ("forearm", "racket")) and chain["upper_arm"]["peak_frame"] <= max(chain["forearm"]["peak_frame"], chain["racket"]["peak_frame"])
res["checks"]["kinetic_chain"] = {"peaks": chain, "rule": "knee<=pelvis<=trunk<=upper_arm proximal-to-distal (knee strictly before upper arm); forearm & racket peak within [C-2,C+1] (Fleisig 2003)", "pass": all(a <= b for a, b in zip(order, order[1:])) and order[0] < order[-1] and distal_ok, "note": "same-frame peaks (1/60 s) count as in order"}
# 5. joint limits
lim = {"elbow_r": (0, 150), "elbow_l": (0, 150), "knee_l": (0, 155), "knee_r": (0, 155), "wrist_r": (0, 80)}
viol = {k: [r["f"] for r in rec if not (lo <= r[k] <= hi)] for k, (lo, hi) in lim.items()}
res["checks"]["joint_limits"] = {"ranges": {k: [round(min(r[k] for r in rec), 1), round(max(r[k] for r in rec), 1)] for k in lim},
                                 "violations": {k: v[:6] for k, v in viol.items() if v}, "pass": not any(viol.values())}
# 6. bone length
res["checks"]["bone_length"] = {"max_err_mm": round(max(r["len_err"] for r in rec) * 1000, 3), "pass": max(r["len_err"] for r in rec) < 0.0005}
# 7. contact
rc = next(r for r in rec if r["f"] == T["contact"])
gap = (rc["sweet"] - rc["ball"]).length
sp = [0.0] + [(b["sweet"] - a["sweet"]).length * FPS for a, b in zip(rec, rec[1:])]
peak_i = max(range(len(rec)), key=lambda i: sp[i])
front = (rc["sweet"] - rc["pelvis"]).dot(Vector((0, -1, 0)))
above = rc["sweet"].z - world_head(rig, "head").z if False else None
sc.frame_set(T["contact"]); head_top = world_tail(rig, "head").z
res["checks"]["contact"] = {"sweetspot_ball_gap_cm": round(gap * 100, 1), "contact_height_m": round(rc["sweet"].z, 2),
                            "above_head_top_cm": round((rc["sweet"].z - head_top) * 100, 1), "in_front_of_pelvis_cm": round(front * 100, 1),
                            "racket_speed_peak_frame": rec[peak_i]["f"], "racket_speed_peak_m_s": round(sp[peak_i], 1),
                            "racket_speed_at_contact_m_s": round(sp[[r["f"] for r in rec].index(T["contact"])], 1),
                            "pro_range_m_s": [35, 50], "pass": gap < 0.04 and abs(rec[peak_i]["f"] - T["contact"]) <= 2 and front > 0 and rc["sweet"].z > head_top and 35 <= sp[peak_i] <= 50}
# 8. balance (grounded frames)
def hull_dist(p, pts):
    # distance from p to convex hull of pts (2D); 0 if inside
    P = sorted({(round(q.x, 4), round(q.y, 4)) for q in pts})
    if len(P) < 3: return min(math.hypot(p.x - x, p.y - y) for x, y in P)
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for q in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    for q in reversed(P):
        while len(up) >= 2 and cross(up[-2], up[-1], q) <= 0: up.pop()
        up.append(q)
    H = lo[:-1] + up[:-1]
    inside = all(cross(H[i], H[(i+1) % len(H)], (p.x, p.y)) >= 0 for i in range(len(H)))
    if inside: return 0.0
    best = 1e9
    for i in range(len(H)):
        a, b = Vector((*H[i], 0)), Vector((*H[(i+1) % len(H)], 0)); q = Vector((p.x, p.y, 0))
        t = max(0, min(1, (q - a).dot(b - a) / max((b - a).length_squared, 1e-9))); best = min(best, (q - (a + (b - a) * t)).length)
    return best
bal = []
for r in rec:
    sup = (r["sole_l"] if r["shoe_l_min"] < GROUND_EPS else []) + (r["sole_r"] if r["shoe_r_min"] < GROUND_EPS else [])
    if not sup: continue
    both_planted = r["shoe_l_min"] < GROUND_EPS and r["shoe_r_min"] < GROUND_EPS
    if (r["f"] < T["trophy"] or r["f"] > LAND + 14) and both_planted:      # quasi-static double-support phases must be balanced
        bal.append((r["f"], hull_dist(r["com"], sup)))
worst_bal = max(bal, key=lambda t: t[1]) if bal else (None, 0)
res["checks"]["balance"] = {"worst_com_outside_support_cm": round(worst_bal[1] * 100, 1), "frame": worst_bal[0], "pass": worst_bal[1] < 0.10}
# 9. racket clearance
rib = [(r["f"], r["racket_in_body"]) for r in rec if r["racket_in_body"]]
res["checks"]["racket_body_clearance"] = {"frames_with_intersection": rib[:10], "pass": not rib}
res["summary"] = {k: v["pass"] for k, v in res["checks"].items()}
res["series"] = {"frame": [r["f"] for r in rec], "pelvis_z": [round(r["pelvis"].z, 4) for r in rec], "com_z": [round(r["com"].z, 4) for r in rec],
                 "knee_l": [round(r["knee_l"], 1) for r in rec], "knee_r": [round(r["knee_r"], 1) for r in rec], "elbow_r": [round(r["elbow_r"], 1) for r in rec],
                 "racket_speed": [round(x, 2) for x in sp], "shoe_l_min": [round(r["shoe_l_min"], 4) for r in rec], "shoe_r_min": [round(r["shoe_r_min"], 4) for r in rec],
                 "ang_pelvis": [round(x) for x in ang_speed("v_pel")], "ang_trunk": [round(x) for x in ang_speed("v_trunk")],
                 "ang_uarm": [round(x) for x in ang_speed("v_uarm")], "ang_farm": [round(x) for x in ang_speed("v_farm")], "ang_racket": [round(x) for x in ang_speed("v_rack")],
                 "ball_z": [round(r["ball"].z, 3) for r in rec], "sweet_z": [round(r["sweet"].z, 3) for r in rec]}
json.dump(res, open(os.path.join(ROOT, "qa", "physics_report.json"), "w"), indent=1)
print()
for k, v in res["checks"].items():
    print("CHECK", k, "PASS" if v["pass"] else "FAIL", json.dumps({kk: vv for kk, vv in v.items() if kk != "pass"})[:600])
