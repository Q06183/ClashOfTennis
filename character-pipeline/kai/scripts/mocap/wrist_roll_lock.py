"""Post-contact racket roll lock (review round 4).
Problem: after contact the racket spun about its OWN long axis (up to 39 deg/frame at f98, ~124 deg total over f97-117)
because the hand's roll relative to the forearm reversed and then rolled back.  Real servers pronate INTO contact; after
contact the racket just follows the arm down/across without spinning about its shaft.

Method (racket-centric, so it does not depend on how the roll is split between upper arm / forearm / hand):
  * keep the racket AXIS direction exactly as it is on every frame (that is the visible swing path);
  * remove the self-roll: from contact on, the racket frame is parallel-transported along its own axis path
    (minimal rotation between consecutive axis directions, no twist), starting from the contact pose;
  * the hand is solved from the rigid grip so the racket lands on that frame; the hand's swing relative to the forearm
    is checked against the 80 deg limit.
Re-derives the forearm twist bone (unwrapped)."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve_review3_backup.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); C = plan["T"]["contact"]; nF = sc.frame_end
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
Y = Vector((0, 1, 0))
def Wq(n): return (rig.matrix_world.to_3x3() @ rig.pose.bones[n].matrix.to_3x3()).normalized().to_quaternion()
def base3(n):
    pb = rig.pose.bones[n]
    return (rig.matrix_world.to_3x3() @ pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[n]).normalized()
def setwq(n, q):
    rig.pose.bones[n].rotation_quaternion = (base3(n).inverted() @ q.to_matrix()).to_quaternion(); bpy.context.view_layer.update()
def Rq(): return racket.matrix_world.to_3x3().normalized().to_quaternion()
def roll_series():
    out = {}; prev = None
    for f in range(C - 2, nF + 1):
        sc.frame_set(f); q = Rq(); u = q @ Y
        if prev is not None:
            dq = prev.rotation_difference(q); ax = Vector((dq.x, dq.y, dq.z))
            r = math.degrees(2 * math.atan2(ax.dot(u), dq.w)) if ax.length > 1e-9 else 0.0
            out[f] = (r + 180) % 360 - 180
        prev = q.copy()
    return out
before = roll_series()
sc.frame_set(1); bpy.context.view_layer.update()
RIN = Wq("hand_r").inverted() @ Rq()                        # racket orientation in hand space (rigid grip)
# target racket frames: same axis path, zero self-roll (parallel transport) from the contact pose
AX = {}
for f in range(C, nF + 1):
    sc.frame_set(f); AX[f] = (Rq() @ Y).normalized()
sc.frame_set(C); TGT = {C: Rq()}
for f in range(C + 1, nF + 1):
    TGT[f] = AX[f - 1].rotation_difference(AX[f]) @ TGT[f - 1]
sw_max = 0
for f in range(C + 1, nF + 1):
    sc.frame_set(f)
    setwq("hand_r", TGT[f] @ RIN.inverted())
    q = rig.pose.bones["hand_r"].rotation_quaternion
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); sw = q @ tw.inverted()
    sw_max = max(sw_max, math.degrees(2 * math.acos(min(1.0, abs(sw.w)))))
    rig.pose.bones["hand_r"].keyframe_insert("rotation_quaternion", frame=f)
# forearm twist bone from the hand roll (unwrapped)
prev = None
for f in range(1, nF + 1):
    sc.frame_set(f); q = rig.pose.bones["hand_r"].rotation_quaternion
    tw = Quaternion((q.w, 0, q.y, 0)); tw.normalize(); a = 2 * math.atan2(tw.y, tw.w)
    if prev is not None:
        while a - prev > math.pi: a -= 2 * math.pi
        while a - prev < -math.pi: a += 2 * math.pi
    prev = a
    t = rig.pose.bones["lowerarm_twist_01_r"]; t.rotation_quaternion = Quaternion(Y, 0.5 * a); t.keyframe_insert("rotation_quaternion", frame=f)
after = roll_series()
bmax = max((abs(v), f) for f, v in before.items() if f > C)
amax = max((abs(v), f) for f, v in after.items() if f > C)
btot = sum(abs(v) for f, v in before.items() if f > C); atot = sum(abs(v) for f, v in after.items() if f > C)
print(f"ROLL after contact: max self-roll {bmax[0]:.1f} -> {amax[0]:.1f} deg/frame; total {btot:.0f} -> {atot:.0f} deg; wrist swing max {sw_max:.0f} deg")
# axis path must be unchanged
dev = 0
for f in range(C, nF + 1):
    sc.frame_set(f); dev = max(dev, math.degrees((Rq() @ Y).angle(AX[f])))
print(f"AXIS path deviation max {dev:.2f} deg")
plan.setdefault("review_fixes", {})["post_contact_racket_roll_locked_from"] = C
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
