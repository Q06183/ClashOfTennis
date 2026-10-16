"""Groundstroke racket-body clearance (adapted from mocap/racket_clear.py for kai_07_ground.blend).

For each stroke, frames 1..follow+6 except the contact window [C-3, C+3] (contact pose must stay exact):
search the smallest wrist offset (flex / deviation / pronation about anatomical hand axes) removing every
racket-vs-body/shorts/shirt penetration, then apply a smooth max-envelope Gaussian bump (sigma 4 frames)
so the racket slides past the body without popping. Saves in place and reports remaining frames.
"""
import bpy, os, sys, math, json
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; sc = bpy.context.scene
PLANS = json.load(open(os.path.join(ROOT, "qa", "ground_plan.json")))
B = {b.name: b for b in rig.data.bones}
inv = B["hand_r"].matrix_local.to_3x3().inverted()
lat_w = (B["index_01_r"].head_local - B["pinky_01_r"].head_local).normalized()
palm_w = (B["hand_r"].tail_local - B["hand_r"].head_local).normalized().cross(lat_w).normalized()
AX_F, AX_D, AX_P = (inv @ lat_w).normalized(), (inv @ palm_w).normalized(), Vector((0, 1, 0))
meshes = [bpy.data.objects[n] for n in ("Kai_Body", "Kai_Shorts", "Kai_Shirt") if n in bpy.data.objects]

def body_tree():
    """one BVH per mesh: a merged tree lets the nearest point land on the shirt and miss a racket point
    that is inside the body underneath (QA tests the body on its own)."""
    dg = bpy.context.evaluated_depsgraph_get(); trees = []
    for o in meshes:
        ev = o.evaluated_get(dg); m = ev.to_mesh()
        trees.append(BVHTree.FromPolygons([ev.matrix_world @ v.co for v in m.vertices],
                                          [list(p.vertices) for p in m.polygons]))
        ev.to_mesh_clear()
    return trees
RV = [v.co.copy() for i, v in enumerate(racket.data.vertices) if v.co.y >= 0.20]
def hits(trees):
    n = 0
    for c in RV:
        p = racket.matrix_world @ c
        for tree in trees:
            loc, nrm, idx, d = tree.find_nearest(p)
            if loc is not None and d < 0.05 and (p - loc).dot(nrm) < 0.012: n += 1; break
    return n
def wrist(base, o):
    return base @ Quaternion(AX_P, math.radians(o[2])) @ Quaternion(AX_D, math.radians(o[1])) @ Quaternion(AX_F, math.radians(o[0]))
OFFS = sorted(((df, dd, dp) for df in (-50, -35, -20, 0, 20, 35, 50) for dd in (-40, -25, -10, 0, 10, 25, 40)
               for dp in (-90, -70, -50, -30, -10, 0, 20, 40, 60)), key=lambda t: abs(t[0]) + abs(t[1]) + abs(t[2]) * 0.7)
def smooth(d, sig=4.0):
    out = {}
    for f in d:
        best = 0.0
        for g, v in d.items():
            if v == 0: continue
            c = v * math.exp(-((f - g) ** 2) / (2 * sig * sig))
            if abs(c) > abs(best): best = c
        out[f] = best
    return out

report = {}
for name in ("Forehand", "Backhand"):
    T = PLANS[name]["T"]; C = T["contact"]
    rig.animation_data.action = bpy.data.actions[name]
    sc.frame_start, sc.frame_end = 1, T["end"]
    F = [f for f in range(1, T["follow"] + 7) if not (C - 3 <= f <= C + 3)]
    pb = rig.pose.bones["hand_r"]
    base = {}
    for f in F:
        sc.frame_set(f); base[f] = pb.rotation_quaternion.copy()
    need = {}
    for f in F:
        sc.frame_set(f); bpy.context.view_layer.update(); tree = body_tree()
        if hits(tree) == 0: continue
        found = None
        for o in OFFS:
            pb.rotation_quaternion = wrist(base[f], o); bpy.context.view_layer.update()
            if hits(tree) == 0: found = o; break
        pb.rotation_quaternion = base[f]
        need[f] = found
    print(name, "CLEAR need", need)
    ax = {k: {f: 0.0 for f in F} for k in range(3)}
    for f, v in need.items():
        if v:
            for k in range(3): ax[k][f] = float(v[k])
    S = {k: smooth(ax[k]) for k in range(3)}
    for it in range(8):
        S = {k: smooth(ax[k]) for k in range(3)}
        bad = []
        for f in F:
            sc.frame_set(f); pb.rotation_quaternion = wrist(base[f], (S[0][f], S[1][f], S[2][f]))
            bpy.context.view_layer.update()
            if hits(body_tree()): bad.append(f)
        print(f"  {name} iter {it}: still intersecting {bad}")
        if not bad: break
        for f in bad:
            for k in range(3):
                seed = (need.get(f) or (0, 0, -20))[k]
                ax[k][f] = (ax[k][f] or seed) * 1.3 + (-5 if k == 2 else 0)
    # taper the bump into the frozen contact window so the wrist never jumps at its edges:
    # full strength until C-9 / after C+9, smooth ramp to 0 at C-3 / C+3
    def taper(f):
        def s_(x): x = max(0.0, min(1.0, x)); return x*x*(3-2*x)
        if f < C: return 1.0 - s_((f - (C-9)) / 6.0)
        return s_((f - (C+3)) / 6.0)
    for k in range(3):
        for f in F: S[k][f] *= taper(f)
    # bake: wrist keys only inside F; contact window untouched
    for f in F:
        sc.frame_set(f); pb.rotation_quaternion = wrist(base[f], (S[0][f], S[1][f], S[2][f]))
        pb.keyframe_insert("rotation_quaternion", frame=f)
    # residual pass: frames still intersecting (offsets cancelled by smoothing or attenuated by the contact
    # taper) get the smallest offset searched from their CURRENT pose; neighbours +-1 / +-2 get 1/2 and 1/4
    # of it (never inside the frozen contact window) so the correction stays smooth.
    Fset = set(F)
    for rp in range(4):
        bad = []
        for f in F:
            sc.frame_set(f); bpy.context.view_layer.update()
            if hits(body_tree()): bad.append(f)
        if not bad: break
        cur = {}
        for f in F:
            sc.frame_set(f); cur[f] = pb.rotation_quaternion.copy()
        add = {}
        for f in bad:
            sc.frame_set(f); bpy.context.view_layer.update(); tree = body_tree(); found = None
            for o in OFFS:
                pb.rotation_quaternion = wrist(cur[f], o); bpy.context.view_layer.update()
                if hits(tree) == 0: found = o; break
            pb.rotation_quaternion = cur[f]
            if found is None: continue
            for d, wgt in ((0, 1.0), (-1, 0.5), (1, 0.5), (-2, 0.25), (2, 0.25)):
                g = f + d
                if g not in Fset: continue
                prev = add.get(g, (0.0, 0.0, 0.0))
                cand = tuple(found[k] * wgt for k in range(3))
                add[g] = tuple(cand[k] if abs(cand[k]) > abs(prev[k]) else prev[k] for k in range(3))
        for g, o in add.items():
            sc.frame_set(g); pb.rotation_quaternion = wrist(cur[g], o)
            pb.keyframe_insert("rotation_quaternion", frame=g)
        print(f"  {name} residual pass {rp}: fixed {sorted(add)} from bad {bad}")
    left = []
    for f in F:
        sc.frame_set(f); bpy.context.view_layer.update()
        if hits(body_tree()): left.append(f)
    report[name] = {"remaining": left, "peak_offset_deg": {k: round(max([abs(x) for x in S[k].values()] or [0]), 1) for k in range(3)}}
    print(name, "CLEAR remaining", left, report[name]["peak_offset_deg"])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
print("SAVED", report)
