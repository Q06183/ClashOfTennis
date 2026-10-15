"""Racket drop (review round 5): "击球前，掉拍头掉的不够".
Measured: in frames 80-93 the racket never points down (min tilt from vertical-down 108 deg; at f86-88 it points UP,
157 deg).  In a pro serve the racket head drops down behind the back at max shoulder external rotation (~170 deg ER),
about 0.08-0.10 s before contact, then the arm internally rotates violently into contact (Elliott 1995; Fleisig 2003).
The mocap has no reliable humeral rotation (only segment directions), so ER is missing.

Fix: add external rotation of the upper arm about its OWN long axis (humerus twist) in [C-W_UP, C]:
   phi(f) rises smoothly from 0 to PEAK at C-6 (max drop) and returns to 0 at contact (fast internal rotation),
so the contact pose itself is untouched.  Elbow/forearm/hand follow as children, which swings the forearm back and
lets the racket hang head-down behind the back.  Sign and PEAK are searched so that the racket reaches
<= 40 deg from vertical-down at max drop without hitting the head/back.  The wrist is not over-bent (unchanged).
upperarm_twist_01_r is re-derived (K counter-twist) so the shoulder skin does not candy-wrap."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT, world_head, world_tail
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]; C = T["contact"]; nF = sc.frame_end
FPS = plan["fps"]
Y, DOWN = Vector((0, 1, 0)), Vector((0, 0, -1))
pbU = rig.pose.bones["upperarm_r"]
W_UP, PEAK_F = 16, C - 6
F0 = C - W_UP
ORIG = {}
for f in range(F0, C + 1):
    sc.frame_set(f); ORIG[f] = pbU.rotation_quaternion.copy()
def phi(f, peak):
    if f <= F0 or f >= C: return 0.0
    if f <= PEAK_F:
        u = (f - F0) / (PEAK_F - F0); return peak * (u * u * (3 - 2 * u))
    u = (f - PEAK_F) / (C - PEAK_F); return peak * 0.5 * (1 + math.cos(math.pi * u))
def apply(f, peak):
    sc.frame_set(f)
    pbU.rotation_quaternion = ORIG[f] @ Quaternion(Y, math.radians(phi(f, peak)))   # local Y = humerus long axis
    bpy.context.view_layer.update()
def tilt():
    return math.degrees((racket.matrix_world.to_3x3() @ Y).normalized().angle(DOWN))
# collision with head/torso (racket head part only)
body_objs = [bpy.data.objects[n] for n in ("Kai_Body", "Kai_Shirt", "Kai_Hair", "Kai_Headband") if n in bpy.data.objects]
RV = [v.co.copy() for i, v in enumerate(racket.data.vertices) if i % 3 == 0 and v.co.y >= 0.20]
def hits():
    dg = bpy.context.evaluated_depsgraph_get(); verts = []; polys = []
    for o in body_objs:
        ev = o.evaluated_get(dg); m = ev.to_mesh(); off = len(verts)
        verts += [ev.matrix_world @ v.co for v in m.vertices]; polys += [[off + i for i in p.vertices] for p in m.polygons]
        ev.to_mesh_clear()
    tree = BVHTree.FromPolygons(verts, polys); n = 0
    for c in RV:
        p = racket.matrix_world @ c; loc, nrm, idx, d = tree.find_nearest(p)
        if loc is not None and d < 0.05 and (p - loc).dot(nrm) < 0.015: n += 1
    return n
apply(PEAK_F, 0.0); t0 = tilt()
best = None
for sgn in (1, -1):
    for mag in range(20, 141, 10):
        peak = sgn * mag
        apply(PEAK_F, peak); t = tilt()
        h = 0
        if t < t0:
            for f in range(PEAK_F - 4, PEAK_F + 3, 2):
                apply(f, peak); h += hits()
        cost = max(0.0, t - 35) + h * 20 + mag * 0.05
        if best is None or cost < best[0]: best = (cost, peak, t, h)
_, PEAK, TILT, H = best
print(f"DROP search: tilt at C-6 before {t0:.0f} deg from down -> {TILT:.0f} deg with ER {PEAK:+d} deg; head/back hits {H}")
for f in range(F0, C + 1):
    apply(f, PEAK); pbU.keyframe_insert("rotation_quaternion", frame=f)
# re-derive the upper-arm counter-twist bone from the final upper-arm local twist (unwrapped)
K = json.load(open(os.path.join(ROOT, "qa", "twist_distribution.json")))["upperarm_twist_counter_K"]
prev = None
for f in range(1, nF + 1):
    sc.frame_set(f); q = pbU.rotation_quaternion
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); a = 2 * math.atan2(tw.y, tw.w)
    if prev is not None:
        while a - prev > math.pi: a -= 2 * math.pi
        while a - prev < -math.pi: a += 2 * math.pi
    prev = a
    t = rig.pose.bones["upperarm_twist_01_r"]; t.rotation_quaternion = Quaternion(Y, -K * a); t.keyframe_insert("rotation_quaternion", frame=f)
# report the new drop profile
lo = None; rows = []
for f in range(F0, C + 1):
    sc.frame_set(f); tip = racket.matrix_world @ Vector((0, 0.68, 0)); tl = tilt()
    rows.append((f, round(tl), round(tip.z, 2)))
    if lo is None or tl < lo[1]: lo = (f, tl, tip.z)
print("DROP profile (frame, tilt-from-down, tip z):", rows)
print(f"DROP deepest at frame {lo[0]} ({(lo[0]-C)/FPS:+.2f} s): racket {lo[1]:.0f} deg from vertical-down, tip z {lo[2]:.2f} m")
T["drop"] = lo[0]; plan["T"] = T
plan.setdefault("review_fixes", {})["racket_drop_ER"] = {"peak_deg": PEAK, "peak_frame": PEAK_F, "window": [F0, C]}
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
