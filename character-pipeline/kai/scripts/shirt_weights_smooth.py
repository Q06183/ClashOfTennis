"""Shirt skinning fix (v4) - parameter sweep, then apply the best.
Weights per shirt vertex = blend of
  (a) BODY weights at the closest body-surface point (barycentric) - near the arm skin (< d0) the sleeve then
      follows the arm exactly like the skin underneath, which deforms cleanly (body p99 1.33);
  (b) the shirt's own original weights where the body has no surface underneath (torso is cut out under the shirt);
blended linearly between d0 and d1, then Gaussian-smoothed in rest space (sigma, IT iterations) to spread the
residual shoulder stretch over a larger area; top-4, normalised (glTF).
Score = worst p99 / max edge strain of the shirt over the overhead frames.  Writes kai_04_rigged + kai_05_serve."""
import bpy, os, sys, math, json
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT
FR = [19, 72, 91, 94, 97, 110]
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged_preweightfix.blend"))
sh = bpy.data.objects["Kai_Shirt"]; body = bpy.data.objects["Kai_Body"]; rig = bpy.data.objects["Kai_Rig"]
deform = {b.name for b in rig.data.bones if b.use_deform}
gi = {g.index: g.name for g in sh.vertex_groups}; bgi = {g.index: g.name for g in body.vertex_groups}
P = [sh.matrix_world @ v.co for v in sh.data.vertices]
W0 = [{gi[g.group]: g.weight for g in v.groups if gi[g.group] in deform and g.weight > 1e-4} for v in sh.data.vertices]
BW = [{bgi[g.group]: g.weight for g in v.groups if bgi[g.group] in deform and g.weight > 1e-4} for v in body.data.vertices]
BP = [body.matrix_world @ v.co for v in body.data.vertices]; TRI = []
for p in body.data.polygons:
    vs = list(p.vertices); TRI += [(vs[0], vs[i], vs[i + 1]) for i in range(1, len(vs) - 1)]
tree = BVHTree.FromPolygons(BP, TRI)
def bary(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-14: return (1, 0, 0)
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den; u = 1 - v - w
    u, v, w = max(0, u), max(0, v), max(0, w); s = u + v + w or 1
    return (u / s, v / s, w / s)
NEAR = []
for p in P:
    loc, nrm, ti, d = tree.find_nearest(p)
    a, b, c = TRI[ti]; u, v, w = bary(loc, BP[a], BP[b], BP[c]); acc = {}
    for i, k in ((a, u), (b, v), (c, w)):
        for n, x in BW[i].items(): acc[n] = acc.get(n, 0) + x * k
    NEAR.append((d, acc))
kd = KDTree(len(P))
for i, p in enumerate(P): kd.insert(p, i)
kd.balance()
def build(d0, d1, sig, it):
    W = []
    for (d, bw), w0 in zip(NEAR, W0):
        t = 1.0 if d <= d0 else (0.0 if d >= d1 else (d1 - d) / (d1 - d0))
        acc = {}
        for n, x in w0.items(): acc[n] = acc.get(n, 0) + x * (1 - t)
        for n, x in bw.items(): acc[n] = acc.get(n, 0) + x * t
        W.append(acc)
    if sig > 0:
        NB = [[(j, math.exp(-(dd * dd) / (2 * sig * sig))) for (_, j, dd) in kd.find_range(p, sig * 2.5)] for p in P]
        for _ in range(it):
            NW = []
            for i in range(len(P)):
                acc = {}; tot = 0
                for j, k in NB[i]:
                    tot += k
                    for n, x in W[j].items(): acc[n] = acc.get(n, 0) + x * k
                NW.append({n: x / tot for n, x in acc.items()})
            W = NW
    out = []
    for w in W:
        top = sorted(w.items(), key=lambda t: -t[1])[:4]; s = sum(x for _, x in top) or 1
        out.append([(n, x / s) for n, x in top if x / s > 1e-3])
    return out
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
sh = bpy.data.objects["Kai_Shirt"]; rig = bpy.data.objects["Kai_Rig"]; sc = bpy.context.scene
rig.data.pose_position = 'REST'; bpy.context.view_layer.update()
ev = sh.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
RL = [(me.vertices[e.vertices[0]].co - me.vertices[e.vertices[1]].co).length for e in sh.data.edges]; ev.to_mesh_clear()
rig.data.pose_position = 'POSE'
EDGES = [tuple(e.vertices) for e in sh.data.edges]
def apply(W):
    for vg in list(sh.vertex_groups): sh.vertex_groups.remove(vg)
    G = {}
    for i, lst in enumerate(W):
        for n, x in lst:
            if n not in G: G[n] = sh.vertex_groups.new(name=n)
            G[n].add([i], x, 'REPLACE')
def score():
    worst99 = 0; worstmax = 0
    for f in FR:
        sc.frame_set(f); ev = sh.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
        rs = sorted((me.vertices[a].co - me.vertices[b].co).length / L for (a, b), L in zip(EDGES, RL) if L > 1e-6)
        ev.to_mesh_clear()
        worst99 = max(worst99, rs[int(len(rs) * .99)]); worstmax = max(worstmax, rs[-1])
    return worst99, worstmax
res = []
for d0, d1 in ((-1.0, -0.5), (0.02, 0.05), (0.03, 0.08)):
    for sig, it in ((0.012, 3), (0.02, 4), (0.03, 6), (0.045, 6)):
        W = build(d0, d1, sig, it); apply(W); p99, mx = score()
        res.append((p99 + mx * 0.1, d0, d1, sig, it, p99, mx, W))
        print(f"SWEEP body<{d0} blend<{d1} sigma={sig} it={it}: p99={p99:.2f} max={mx:.2f}", flush=True)
best = min(res, key=lambda r: r[0])
_, d0, d1, sig, it, p99, mx, W = best
print(f"BEST body<{d0} blend<{d1} sigma={sig} it={it} -> p99={p99:.2f} max={mx:.2f}")
apply(W); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
sh = bpy.data.objects["Kai_Shirt"]; apply(W); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
json.dump({"d0": d0, "d1": d1, "sigma": sig, "iterations": it, "p99": p99, "max": mx}, open(os.path.join(ROOT, "qa", "shirt_weights.json"), "w"))
print("SAVED")
