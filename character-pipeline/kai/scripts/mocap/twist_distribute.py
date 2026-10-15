"""Upper-arm twist distribution (anti candy-wrap at the shoulder).
For each frame, decompose the upperarm_* local rotation into swing * twist (twist about the bone's Y axis) and
counter-rotate upperarm_twist_01_* (child of upperarm, carries the weights near the shoulder) by -K*twist, so the
shoulder/armpit skin only sees (1-K) of the long-axis rotation - standard game-rig practice.
Sweeps K, keeps the value with the lowest shirt+body strain, keys it.  Also reports body strain."""
import bpy, os, sys, math, json
from mathutils import Quaternion, Vector
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; sc = bpy.context.scene
OBJ = [bpy.data.objects["Kai_Shirt"], bpy.data.objects["Kai_Body"]]
FR = [19, 72, 91, 94, 97, 110]
rig.data.pose_position = 'REST'; bpy.context.view_layer.update()
RL = {}
for o in OBJ:
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    RL[o.name] = [((e.vertices[0], e.vertices[1]), (me.vertices[e.vertices[0]].co - me.vertices[e.vertices[1]].co).length) for e in o.data.edges]
    ev.to_mesh_clear()
rig.data.pose_position = 'POSE'
def twist_angle(q):
    t = Quaternion((q.w, 0, q.y, 0))
    if t.magnitude < 1e-9: return 0.0
    t.normalize(); a = 2 * math.atan2(t.y, t.w)
    return (a + math.pi) % (2 * math.pi) - math.pi
TW = {}
for f in range(sc.frame_start, sc.frame_end + 1):
    sc.frame_set(f)
    TW[f] = {s: twist_angle(rig.pose.bones["upperarm_" + s].rotation_quaternion) for s in ("l", "r")}
print("UPPERARM twist range deg: l [%.0f, %.0f]  r [%.0f, %.0f]" % (
    min(math.degrees(t["l"]) for t in TW.values()), max(math.degrees(t["l"]) for t in TW.values()),
    min(math.degrees(t["r"]) for t in TW.values()), max(math.degrees(t["r"]) for t in TW.values())))
def setK(K, write=False):
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f)
        for s in ("l", "r"):
            pb = rig.pose.bones["upperarm_twist_01_" + s]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = Quaternion(Vector((0, 1, 0)), -K * TW[f][s])
            if write: pb.keyframe_insert("rotation_quaternion", frame=f)
def strain():
    out = {}
    for o in OBJ:
        w99 = wmax = 0
        for f in FR:
            sc.frame_set(f)
            # twist bones may have fcurves - when evaluating a candidate, override after frame_set
            for s in ("l", "r"):
                rig.pose.bones["upperarm_twist_01_" + s].rotation_quaternion = Quaternion(Vector((0, 1, 0)), -CUR_K * TW[f][s])
            bpy.context.view_layer.update()
            ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
            rs = sorted((me.vertices[a].co - me.vertices[b].co).length / L for (a, b), L in RL[o.name] if L > 1e-6)
            ev.to_mesh_clear()
            w99 = max(w99, rs[int(len(rs) * .99)]); wmax = max(wmax, rs[-1])
        out[o.name] = (w99, wmax)
    return out
# remove existing fcurves on the upper-arm twist bones so the override is authoritative
ad = rig.animation_data
if ad and ad.action:
    for fc in list(ad.action.fcurves) if hasattr(ad.action, "fcurves") else []:
        if 'upperarm_twist_01_' in fc.data_path: ad.action.fcurves.remove(fc)
best = None
for K in (0.0, 0.3, 0.5, 0.7, 0.9):
    CUR_K = K; r = strain()
    sh, bd = r["Kai_Shirt"], r["Kai_Body"]
    sc_ = sh[0] + bd[0] * 2 + sh[1] * 0.05
    print(f"K={K}: shirt p99={sh[0]:.2f} max={sh[1]:.2f} | body p99={bd[0]:.2f} max={bd[1]:.2f}", flush=True)
    if best is None or sc_ < best[0]: best = (sc_, K, r)
K = best[1]; print("BEST K", K)
CUR_K = K; setK(K, write=True)
json.dump({"upperarm_twist_counter_K": K, "strain": best[2]}, open(os.path.join(ROOT, "qa", "twist_distribution.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
