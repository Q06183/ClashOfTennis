import bpy, os, sys, json, math
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, reset
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]; body = bpy.data.objects["Kai_Body"]
B = {b.name: b for b in rig.data.bones}
hp = lambda n: B[n].head_local.copy(); tl = lambda n: B[n].tail_local.copy()
hand, mid0 = hp("hand_r"), hp("middle_01_r")
a = (mid0 - hand).normalized(); lat = (hp("index_01_r") - hp("pinky_01_r")).normalized()
n = a.cross(lat).normalized()
print("HAND", tuple(round(x,3) for x in hand), "MID0", tuple(round(x,3) for x in mid0), "a", tuple(round(x,2) for x in a), "lat", tuple(round(x,2) for x in lat), "n(raw)", tuple(round(x,2) for x in n))
print("MID tail3", tuple(round(x,3) for x in tl("middle_03_r")), "thumb02", tuple(round(x,3) for x in hp("thumb_02_r")))
hidx = body.vertex_groups["hand_r"].index
pts = [body.matrix_world @ v.co for v in body.data.vertices if any(g.group == hidx and g.weight > 0.6 for g in v.groups)]
c = hand.lerp(mid0, 0.55)
proj = sorted((p - c).dot(n) for p in pts)
print("HAND_SKIN along n: min", round(proj[0], 4), "max", round(proj[-1], 4), "count", len(pts))
# thumb side: which side of the hand (along n) is the thumb on?
print("THUMB01 along n", round((hp("thumb_01_r") - c).dot(n), 4), "THUMB03 tail along n", round((tl("thumb_03_r") - c).dot(n), 4))
# fingertip curl direction at rest
for f in ("index", "middle", "ring", "pinky"):
    print("TIP", f, "along n", round((tl(f + "_03_r") - c).dot(n), 4))
