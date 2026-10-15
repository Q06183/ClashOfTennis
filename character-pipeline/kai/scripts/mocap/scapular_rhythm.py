"""Scapulohumeral rhythm (anatomy): when the arm is raised above ~30 deg, about 1/3 of the elevation comes from the
shoulder girdle (clavicle/scapula elevation + upward rotation), only 2/3 from the gleno-humeral joint
(Inman 1944; McClure 2001).  The mocap gives the arm direction relative to the trunk but its 'collar' joint is
rigidly fixed, so all elevation landed in the shoulder joint -> overhead skin/shirt stretch.
Per frame: abduction a = angle(upper arm, trunk-down); clavicle is rotated upward (about the trunk forward axis,
toward the arm) by K*max(0, a-30deg) capped at 40 deg; the upper arm is then re-set to its previous WORLD rotation,
so arm/forearm/hand/racket directions are unchanged (shoulder joint moves up a few cm, like a real shoulder).
Sweeps K and keeps the best shirt+body strain."""
import bpy, os, sys, math, json
from mathutils import Quaternion, Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT, world_head, world_tail
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; sc = bpy.context.scene
REST = {b.name: b.matrix_local.to_3x3().copy() for b in rig.data.bones}
OBJ = [bpy.data.objects["Kai_Shirt"], bpy.data.objects["Kai_Body"]]
FR = [19, 72, 91, 94, 97, 110]
nF = sc.frame_end
def wrot(n): return (rig.matrix_world.to_3x3() @ rig.pose.bones[n].matrix.to_3x3()).normalized()
def base3(n):
    pb = rig.pose.bones[n]
    return (rig.matrix_world.to_3x3() @ pb.parent.matrix.to_3x3() @ REST[pb.parent.name].inverted() @ REST[n]) if pb.parent else REST[n]
def set_world3(n, R3):
    rig.pose.bones[n].rotation_quaternion = (base3(n).inverted() @ R3).to_quaternion()
# capture originals
ORIG = {}
for f in range(1, nF + 1):
    sc.frame_set(f)
    ORIG[f] = {n: rig.pose.bones[n].rotation_quaternion.copy() for n in ("clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r")}
rig.data.pose_position = 'REST'; bpy.context.view_layer.update()
RL = {}
for o in OBJ:
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    RL[o.name] = [((e.vertices[0], e.vertices[1]), (me.vertices[e.vertices[0]].co - me.vertices[e.vertices[1]].co).length) for e in o.data.edges]
    ev.to_mesh_clear()
rig.data.pose_position = 'POSE'
def apply_frame(f, K):
    sc.frame_set(f)
    for n, q in ORIG[f].items(): rig.pose.bones[n].rotation_quaternion = q
    bpy.context.view_layer.update()
    info = {}
    for s in ("l", "r"):
        ua = wrot("upperarm_" + s)
        up = (world_head(rig, "neck_01") - world_head(rig, "spine_01")).normalized()
        arm = (world_tail(rig, "upperarm_" + s) - world_head(rig, "upperarm_" + s)).normalized()
        a = math.degrees(arm.angle(-up))
        el = math.radians(min(40.0, K * max(0.0, a - 30.0)))
        cl = wrot("clavicle_" + s)
        cdir = (cl @ Vector((0, 1, 0))).normalized()
        axis = cdir.cross(up)                     # rotating cdir toward 'up' = elevation
        if axis.length > 1e-6 and el > 0:
            set_world3("clavicle_" + s, Quaternion(axis.normalized(), el).to_matrix() @ cl)
            bpy.context.view_layer.update()
        set_world3("upperarm_" + s, ua); bpy.context.view_layer.update()
        info[s] = (round(a), round(math.degrees(el)))
    return info
def strain(K):
    out = {}
    for o in OBJ:
        w99 = wmax = 0
        for f in FR:
            apply_frame(f, K)
            ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
            rs = sorted((me.vertices[a].co - me.vertices[b].co).length / L for (a, b), L in RL[o.name] if L > 1e-6)
            ev.to_mesh_clear()
            w99 = max(w99, rs[int(len(rs) * .99)]); wmax = max(wmax, rs[-1])
        out[o.name] = (round(w99, 3), round(wmax, 3))
    return out
best = None
for K in (0.0, 0.2, 0.33, 0.45):
    r = strain(K); sh, bd = r["Kai_Shirt"], r["Kai_Body"]
    s_ = sh[0] + 2 * bd[0] + 0.05 * sh[1]
    print(f"K={K}: shirt p99={sh[0]} max={sh[1]} | body p99={bd[0]} max={bd[1]}", flush=True)
    if best is None or s_ < best[0]: best = (s_, K, r)
K = best[1]; print("BEST K", K)
for f in range(1, nF + 1):
    info = apply_frame(f, K)
    for n in ("clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r"):
        rig.pose.bones[n].keyframe_insert("rotation_quaternion", frame=f)
    if f in (1, 72, 94): print("  frame", f, "abduction/clavicle-elev deg", info)
json.dump({"scapulohumeral_K": K, "strain": best[2]}, open(os.path.join(ROOT, "qa", "scapular_rhythm.json"), "w"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
