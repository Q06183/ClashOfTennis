"""Single-frame leg pose despeckle (generic; safe for any rig with thigh/calf/foot_{l,r}).

The source BVH occasionally contains a one-frame posture glitch (a thigh/calf/foot quaternion that jumps
far from both neighbouring frames). After foot-plant IK the foot stays glued but the knee/hip pop, which
shows up as a CoM vertical-acceleration spike. This pass detects such spikes per leg bone and replaces the
offending frame with the slerp midpoint of its neighbours. It only edits frames whose deviation is large on
BOTH sides, so smooth real motion (e.g. a fast step) is left untouched.

Runs on kai_07_ground.blend (all groundstroke actions), saves in place. Chain it AFTER retarget_ground and
BEFORE 09b_ground_contact.
"""
import bpy, os, sys, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
rig = bpy.data.objects["Kai_Rig"]
PLANS = json.load(open(os.path.join(ROOT, "qa", "ground_plan.json")))
sc = bpy.context.scene

LEG_BONES = []
for s in ("l", "r"):
    LEG_BONES += ["thigh_"+s, "calf_"+s, "foot_"+s, "ball_"+s]

# a real keyframe must deviate more than this (deg) from BOTH neighbours to count as a spike
THRESH = 22.0
# do not despeckle inside the contact-freeze window handled by 09c (kept reserved here for clarity)
def run(name):
    T = PLANS[name]["T"]; nF = T["end"]; C = T["contact"]
    rig.animation_data.action = bpy.data.actions[name]
    fixed = []
    for bn in LEG_BONES:
        pb = rig.pose.bones[bn]
        qs = {}
        for f in range(1, nF+1):
            sc.frame_set(f)
            qs[f] = pb.rotation_quaternion.copy()
        for f in range(2, nF):
            qm, q0, qp = qs[f-1], qs[f], qs[f+1]
            a1 = math.degrees(q0.angle(qm)); a2 = math.degrees(q0.angle(qp))
            # neighbours must agree (real motion continues), center frame must be the outlier
            if a1 > THRESH and a2 > THRESH and math.degrees(qm.angle(qp)) < THRESH:
                qfix = qm.slerp(qp, 0.5)
                pb.rotation_quaternion = qfix
                pb.keyframe_insert("rotation_quaternion", frame=f)
                qs[f] = qfix
                fixed.append((bn, f, round(a1), round(a2)))
    print(name, "despeckled", fixed)
    return fixed

report = {}
for nm in ("Forehand", "Backhand"):
    report[nm] = run(nm)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
print("SAVED", {k: len(v) for k, v in report.items()})
