"""Flight fix: during the airborne phase the body's CENTRE OF MASS must follow a free-fall parabola (g = 9.81).
The retarget sets the root height from foot clearance, which is right on the ground but not in the air
(the legs tuck, so foot clearance is not CoM height).  Here the root z in [takeoff, land] is corrected so the
segmental CoM (Dempster/Winter masses, same model as the physics QA) follows the ballistic arc through the
takeoff and landing states; the correction is zero at both ends, so nothing changes on the ground.
Run after retarget_serve.py, before the racket/ball passes (contact happens in the air)."""
import bpy, os, sys, json, math
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from poselib import ROOT, world_head, world_tail
G = 9.81
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]; FPS = plan["fps"]
TO, LD = plan["takeoff"], plan["land"]
SEG = [("head", "head", 0.081), ("spine_03", "spine_03", 0.216), ("spine_01", "spine_02", 0.139), ("pelvis", "pelvis", 0.142),
       ("upperarm_l", "upperarm_l", 0.028), ("upperarm_r", "upperarm_r", 0.028), ("lowerarm_l", "lowerarm_l", 0.016),
       ("lowerarm_r", "lowerarm_r", 0.016), ("hand_l", "hand_l", 0.006), ("hand_r", "hand_r", 0.006),
       ("thigh_l", "thigh_l", 0.10), ("thigh_r", "thigh_r", 0.10), ("calf_l", "calf_l", 0.0465), ("calf_r", "calf_r", 0.0465),
       ("foot_l", "foot_l", 0.0145), ("foot_r", "foot_r", 0.0145)]
def com():
    acc = Vector(); m = 0
    for a, b, w in SEG:
        acc += (world_head(rig, a) + world_tail(rig, b)) * 0.5 * w; m += w
    return acc / m
# use one frame of ground contact on each side as the ballistic end states
f0, f1 = TO - 1, LD
sc.frame_set(f0); z0 = com().z
sc.frame_set(f1); z1 = com().z
Tf = (f1 - f0) / FPS
vz0 = (z1 - z0 + 0.5 * G * Tf * Tf) / Tf
print(f"FLIGHT frames {f0}-{f1} ({Tf:.3f}s)  CoM z {z0:.3f}->{z1:.3f}  takeoff vz={vz0:.2f} m/s apex +{vz0**2/(2*G)*100:.1f} cm")
root = rig.pose.bones["Root"]
before = []; after = []
for f in range(f0 + 1, f1):
    sc.frame_set(f)
    t = (f - f0) / FPS; zt = z0 + vz0 * t - 0.5 * G * t * t
    zc = com().z; before.append(zc - zt)
    root.location.z += zt - zc
    bpy.context.view_layer.update(); after.append(com().z - zt)
    root.keyframe_insert("location", index=2, frame=f)
print("CoM deviation from parabola: before max %.1f cm, after max %.2f mm" % (max(abs(x) for x in before) * 100, max(abs(x) for x in after) * 1000))
plan["flight"] = {"from": f0, "to": f1, "vz0": vz0, "apex_cm": vz0 ** 2 / (2 * G) * 100, "dev_before_cm": max(abs(x) for x in before) * 100}
json.dump(plan, open(os.path.join(ROOT, "qa", "serve_plan.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
