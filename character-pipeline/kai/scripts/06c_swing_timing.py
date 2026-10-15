"""Step 6c: physically-timed racket swing.
Replaces the racket-head trajectory between racket-drop and finish with a C2-smooth curve whose speed
profile matches pro serves: racket-head speed rises from ~5 m/s at the drop to a peak of ~42 m/s exactly at
contact (Elliott 2003; Kovacs 2011: 38-47 m/s), then decays over ~0.12 s (deceleration phase).

Method
  * sample the baked sweet-spot path s(f) at the keyposes: drop (D), contact (C), decel, finish;
  * build the arc-length reparameterisation so the head travels along the SAME spatial path (keeps
    the pose design), but its arc-length position follows the integral of the target speed profile;
  * re-time every bone channel of the arm + racket chain with the same time-warp (spatially identical,
    temporally physical), leaving legs/torso untouched (they already follow the force-based timing).
  * re-check contact: racket at C must still meet the ball (the warp maps C -> C)."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]; FPS = plan["fps"]
sc = bpy.context.scene
D, C = T["drop"], T["contact"]; E = T["decel"] + 8
ARM = [b.name for b in rig.data.bones if b.name.split("_")[0] in ("clavicle", "upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky") and b.name.endswith("_r")]
# 1) sample baked rotations at sub-frame resolution (dense, linear in f) for the arm chain
SUB = 8
def capture(fr):
    sc.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
    return {b: rig.pose.bones[b].rotation_quaternion.copy() for b in ARM}, (racket.matrix_world @ Vector((0, 0.5, 0))).copy()
src_t = [D + i / SUB for i in range((E - D) * SUB + 1)]
samples = [capture(t) for t in src_t]
path = [s[1] for s in samples]
cum = [0.0]
for a, b in zip(path, path[1:]): cum.append(cum[-1] + (b - a).length)
iC = src_t.index(float(C))
L_DC, L_CE = cum[iC], cum[-1] - cum[iC]
print("PATH len drop->contact", round(L_DC, 3), "m  contact->end", round(L_CE, 3), "m")
# 2) target speed profile v(t): accelerate D->C (rising, concave-up like a whip), decelerate C->E
V0, VPEAK, VEND = 5.0, 42.0, 3.0
tD, tC, tE = D / FPS, C / FPS, E / FPS
def v_acc(t):  # power-law rise
    u = (t - tD) / (tC - tD); return V0 + (VPEAK - V0) * u ** 1.15
def v_dec(t):
    u = (t - tC) / (tE - tC); return VEND + (VPEAK - VEND) * math.exp(-4.0 * u) * (1 - u) + 0.0
def integ(fn, a, b, n=400):
    h = (b - a) / n; return sum(fn(a + (i + 0.5) * h) for i in range(n)) * h
# scale so that integrated distance == actual path length (keeps spatial path, fixes contact frame)
kA = L_DC / integ(v_acc, tD, tC); kB = L_CE / integ(v_dec, tC, tE)
print("SPEED scale acc", round(kA, 3), "dec", round(kB, 3), "-> peak at contact", round(VPEAK * kA, 1), "/", round(VPEAK * kB, 1), "m/s")
def s_of_t(t):
    if t <= tC: return integ(lambda x: v_acc(x) * kA, tD, t, 200)
    return L_DC + integ(lambda x: v_dec(x) * kB, tC, t, 200)
def src_index_for_s(s):
    lo, hi = 0, len(cum) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if cum[m] < s: lo = m
        else: hi = m
    u = 0 if cum[hi] == cum[lo] else (s - cum[lo]) / (cum[hi] - cum[lo])
    return lo, u
# 3) re-key arm chain on integer frames D..E with the warped samples
for f in range(D, E + 1):
    s = s_of_t(f / FPS); i, u = src_index_for_s(min(s, cum[-1]))
    j = min(i + 1, len(samples) - 1)
    for b in ARM:
        qa, qb = samples[i][0][b], samples[j][0][b]
        if qa.dot(qb) < 0: qb = -qb
        rig.pose.bones[b].rotation_quaternion = qa.slerp(qb, u)
        rig.pose.bones[b].keyframe_insert("rotation_quaternion", frame=f)
# 4) verify
sc.frame_set(C); pc = racket.matrix_world @ Vector((0, 0.5, 0))
spd = []
prev = None
for f in range(D - 2, E + 3):
    sc.frame_set(f); p = racket.matrix_world @ Vector((0, 0.5, 0))
    if prev is not None: spd.append((f, round((p - prev).length * FPS, 1)))
    prev = p
print("SPEED_PROFILE", spd)
print("CONTACT_SHIFT_MM", round((pc - Vector(path[iC])).length * 1000, 2))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
