"""Racket-body clearance for the early phase (ready -> toss), run after racket_pass / racket_whip.
For each intersecting frame, searches the smallest wrist correction (flex, deviation, pronation offsets, within
anatomical limits) that removes ALL racket-vs-body/shorts penetration; the per-frame offsets are then turned into a
smooth bump (max-envelope + Gaussian temporal smoothing) and re-applied, so the racket swings past the thigh
without popping.  Reports remaining intersections (must be none)."""
import bpy, os, sys, math, json, itertools
import bmesh
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from poselib import ROOT
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
B = {b.name: b for b in rig.data.bones}
inv = B["hand_r"].matrix_local.to_3x3().inverted()
lat_w = (B["index_01_r"].head_local - B["pinky_01_r"].head_local).normalized()
palm_w = (B["hand_r"].tail_local - B["hand_r"].head_local).normalized().cross(lat_w).normalized()
AX_F, AX_D, AX_P = (inv @ lat_w).normalized(), (inv @ palm_w).normalized(), Vector((0, 1, 0))
body = bpy.data.objects["Kai_Body"]; others = [bpy.data.objects[n] for n in ("Kai_Shorts", "Kai_Shirt") if n in bpy.data.objects]
def body_tree():
    dg = bpy.context.evaluated_depsgraph_get(); verts = []; polys = []
    for o in [body] + others:
        ev = o.evaluated_get(dg); m = ev.to_mesh(); off = len(verts)
        verts += [ev.matrix_world @ v.co for v in m.vertices]; polys += [[off + i for i in p.vertices] for p in m.polygons]
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)
RV = None
def racket_pts():
    global RV
    if RV is None:
        me = racket.data; RV = [v.co.copy() for i, v in enumerate(me.vertices) if i % 3 == 0 and v.co.y >= 0.20]
    return [racket.matrix_world @ c for c in RV]
def hits(tree):
    n = 0
    for p in racket_pts():
        loc, nrm, idx, d = tree.find_nearest(p)
        if loc is not None and d < 0.05 and (p - loc).dot(nrm) < 0.012: n += 1
    return n
F0, F1 = 1, T["contact"] - 8
# skip the contact whip window (racket intentionally across the body there is checked separately)
SKIP = set(range(T["contact"] - 7, T["contact"] + 15))
base = {}
for f in range(F0, F1 + 1):
    if f in SKIP: continue
    sc.frame_set(f); base[f] = rig.pose.bones["hand_r"].rotation_quaternion.copy()
OFFS = sorted(((df, dd, dp) for df in (-30, -15, 0, 15, 30) for dd in (-30, -20, -10, 0) for dp in (-70, -55, -40, -25, -10, 0)),
              key=lambda t: abs(t[0]) + abs(t[1]) + abs(t[2]) * 0.7)
need = {}
for f in range(F0, F1 + 1):
    if f in SKIP: continue
    sc.frame_set(f); bpy.context.view_layer.update(); tree = body_tree()   # body pose does not depend on the wrist
    if hits(tree) == 0: continue
    pb = rig.pose.bones["hand_r"]; found = None
    for df, dd, dp in OFFS:
        pb.rotation_quaternion = base[f] @ Quaternion(AX_P, math.radians(dp)) @ Quaternion(AX_D, math.radians(dd)) @ Quaternion(AX_F, math.radians(df))
        bpy.context.view_layer.update()
        if hits(tree) == 0: found = (df, dd, dp); break
    pb.rotation_quaternion = base[f]
    need[f] = found
print("CLEAR need", need)
if any(v is None for v in need.values()): print("WARNING some frames have no clearing offset in the search box")
# smooth bump: per-axis envelope then Gaussian smoothing (sigma 4 frames), keeping >= the required value nearby
ax = {k: {f: 0.0 for f in base} for k in range(3)}
for f, v in need.items():
    if v:
        for k in range(3): ax[k][f] = float(v[k])
def smooth(d, sig=4.0):
    d = {f: v for f, v in d.items()}
    # max-kernel envelope: never below the requirement at any frame, Gaussian ramps in/out (no pops)
    out = {}
    for f in d:
        best = 0.0
        for g, v in d.items():
            if v == 0: continue
            c = v * math.exp(-((f - g) ** 2) / (2 * sig * sig))
            if abs(c) > abs(best): best = c
        out[f] = best
    return out
for it in range(5):
    S = {k: smooth(ax[k]) for k in range(3)}
    bad = []
    for f in range(F0, F1 + 1):
        if f in SKIP: continue
        sc.frame_set(f); pb = rig.pose.bones["hand_r"]
        pb.rotation_quaternion = base[f] @ Quaternion(AX_P, math.radians(S[2][f])) @ Quaternion(AX_D, math.radians(S[1][f])) @ Quaternion(AX_F, math.radians(S[0][f]))
        bpy.context.view_layer.update()
        if hits(body_tree()): bad.append(f)
    print(f"  iter {it}: still intersecting {bad}")
    if not bad: break
    for f in bad:
        for k in range(3): ax[k][f] = (ax[k][f] or (need.get(f) or (0, 0, -10))[k]) * 1.3 + (-5 if k == 2 else 0)
for f in range(F0, F1 + 1):
    if f in SKIP: continue
    sc.frame_set(f); pb = rig.pose.bones["hand_r"]
    pb.rotation_quaternion = base[f] @ Quaternion(AX_P, math.radians(S[2][f])) @ Quaternion(AX_D, math.radians(S[1][f])) @ Quaternion(AX_F, math.radians(S[0][f]))
    pb.keyframe_insert("rotation_quaternion", frame=f)
left = []
for f in range(F0, F1 + 1):
    if f in SKIP: continue
    sc.frame_set(f); bpy.context.view_layer.update()
    if hits(body_tree()): left.append(f)
print("CLEAR remaining", left, "| peak offsets deg", {k: round(max(abs(x) for x in S[k].values()), 1) for k in range(3)})
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
