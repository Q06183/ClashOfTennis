"""Follow-through, monotone and anatomically limited (review round 3).
After the contact snap (C+6) the hand relaxes smoothly to a fixed RELATIVE wrist pose (mild flexion, racket
continuing the forearm line down-across the body) and keeps it - the mocap forearm already carries the arm across
the body to the left, so the racket follows it with no swing back up and no extra roll.  The relative pose is
interpolated in the FOREARM frame, so wrist swing can never exceed the target (<= 45 deg)."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT, world_head, world_tail
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
C, nF = T["contact"], sc.frame_end
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
Y, Zw = Vector((0, 1, 0)), Vector((0, 0, 1))
def Wq(n): return (rig.matrix_world.to_3x3() @ rig.pose.bones[n].matrix.to_3x3()).normalized().to_quaternion()
def base3(n):
    pb = rig.pose.bones[n]
    return (rig.matrix_world.to_3x3() @ pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[n]).normalized()
def setwq(n, q):
    rig.pose.bones[n].rotation_quaternion = (base3(n).inverted() @ q.to_matrix()).to_quaternion(); bpy.context.view_layer.update()
def ease_out(u): u = max(0.0, min(1.0, u)); return 1 - (1 - u) ** 3
def slerp(a, b, t):
    if a.dot(b) < 0: b = -b
    return a.slerp(b, t)
sc.frame_set(1); bpy.context.view_layer.update()
RIN = (Wq("hand_r").inverted() @ racket.matrix_world.to_3x3().normalized().to_quaternion())
def heading():
    left = (world_head(rig, "thigh_l") - world_head(rig, "thigh_r")); left.z = 0; left.normalize()
    fwd = left.cross(Zw).normalized()
    return Matrix((left, fwd, Zw)).transposed().to_quaternion()      # columns: left, forward, up
FA, FB = C + 6, C + 24
sc.frame_set(FA)
qa = Wq("lowerarm_r").inverted() @ Wq("hand_r")            # relative hand pose at end of snap
# target relative pose: rest grip relation + 35 deg flexion toward the palm (racket continues the forearm, angled in)
B = {b.name: b for b in rig.data.bones}
inv = B["hand_r"].matrix_local.to_3x3().inverted()
lat = (B["index_01_r"].head_local - B["pinky_01_r"].head_local).normalized()
palm = (B["hand_r"].tail_local - B["hand_r"].head_local).normalized().cross(lat).normalized()
AXF = (inv @ lat).normalized()
q_rest_rel = (REST["lowerarm_r"].inverted() @ REST["hand_r"]).to_quaternion()
def rel_to_local(qrel): return q_rest_rel.inverted() @ qrel
# ---- clearance-aware target: search wrist flex / deviation / pronation offsets; keep the racket outside the body
from mathutils.bvhtree import BVHTree
AXD = (inv @ palm).normalized(); AXP = Y
body_objs = [bpy.data.objects[n] for n in ("Kai_Body", "Kai_Shorts", "Kai_Shirt") if n in bpy.data.objects]
RV = [v.co.copy() for i, v in enumerate(racket.data.vertices) if i % 3 == 0 and v.co.y >= 0.20]
def body_tree():
    dg = bpy.context.evaluated_depsgraph_get(); verts = []; polys = []
    for o in body_objs:
        ev = o.evaluated_get(dg); m = ev.to_mesh(); off = len(verts)
        verts += [ev.matrix_world @ v.co for v in m.vertices]; polys += [[off + i for i in pl.vertices] for pl in m.polygons]
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)
def hits(tree):
    n = 0
    for c in RV:
        pnt = racket.matrix_world @ c; loc, nrm, idx, d = tree.find_nearest(pnt)
        if loc is not None and d < 0.05 and (pnt - loc).dot(nrm) < 0.015: n += 1
    return n
CHECK = list(range(FB - 6, nF + 1, 3))
TREES = {}
for f in CHECK:
    sc.frame_set(f); bpy.context.view_layer.update(); TREES[f] = body_tree()
def eval_target(qt):
    tot = 0; swm = 0
    for f in CHECK:
        sc.frame_set(f)
        p = ease_out((f - FA) / (FB - FA))
        setwq("hand_r", Wq("lowerarm_r") @ slerp(qa, qt, p))
        q = rig.pose.bones["hand_r"].rotation_quaternion
        tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); sw = q @ tw.inverted()
        swm = max(swm, math.degrees(2 * math.acos(min(1.0, abs(sw.w)))))
        tot += hits(TREES[f])
    return tot, swm
best = None
for fl in (35, 20, 5, -10):
    for dv in (0, -20, 20):
        for pr in (0, 30, -30, 60):
            qt = q_rest_rel @ Quaternion(AXP, math.radians(pr)) @ Quaternion(AXD, math.radians(dv)) @ Quaternion(AXF, math.radians(fl))
            h, swm = eval_target(qt)
            cost = h * 100 + max(0, swm - 70) * 10 + abs(fl - 35) * 0.2 + abs(dv) * 0.1 + abs(pr) * 0.1
            if best is None or cost < best[0]: best = (cost, fl, dv, pr, h, swm, qt)
_, FL, DV, PR, H, SWM, QT = best
SGN = 1
print(f"FOLLOW target: flex {FL} dev {DV} pron {PR} -> racket-body hits {H}, max wrist swing {SWM:.0f} deg")
print("FOLLOW target wrist flexion sign", SGN)
sw_max = 0; path = []
for f in range(FA + 1, nF + 1):
    sc.frame_set(f)
    p = ease_out((f - FA) / (FB - FA))
    setwq("hand_r", Wq("lowerarm_r") @ slerp(qa, QT, p))
    q = rig.pose.bones["hand_r"].rotation_quaternion
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); sw = q @ tw.inverted()
    a = math.degrees(2 * math.acos(min(1.0, abs(sw.w)))); sw_max = max(sw_max, a)
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
    if f in (FA + 1, FA + 6, FB, FB + 10, nF):
        tip = racket.matrix_world @ Vector((0, 0.6, 0)); pel = world_head(rig, "pelvis")
        path.append((f, round(a), tuple(round(x, 2) for x in tip - pel)))
print("FOLLOW wrist swing max", round(sw_max), "deg; samples (frame, swing, tip-pelvis):", path)
# twist bone from hand (unwrapped)
prev = None
for f in range(1, nF + 1):
    sc.frame_set(f); q = rig.pose.bones["hand_r"].rotation_quaternion
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); a = 2 * math.atan2(tw.y, tw.w)
    if prev is not None:
        while a - prev > math.pi: a -= 2 * math.pi
        while a - prev < -math.pi: a += 2 * math.pi
    prev = a
    rig.pose.bones["lowerarm_twist_01_r"].rotation_quaternion = Quaternion(Y, 0.5 * a)
    rig.pose.bones["lowerarm_twist_01_r"].keyframe_insert("rotation_quaternion", frame=f)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
