"""Step 5d: grip refinement.
The handle is pushed out along the palm normal until the palm/heel skin no longer penetrates it, then
fingers are re-solved. Grip axis keeps continental orientation (handle diagonal across the palm)."""
import bpy, os, sys, json, math
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, reset
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]; body = bpy.data.objects["Kai_Body"]; racket = bpy.data.objects["Kai_Racket"]
G = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
B = {b.name: b for b in rig.data.bones}
reset(rig)
hp = lambda n: B[n].head_local.copy(); tl = lambda n: B[n].tail_local.copy()
GRIP_R = 0.0165; FINGER_R = 0.0085

# palm frame (rest pose)
hand, mid0 = hp("hand_r"), hp("middle_01_r")
a = (mid0 - hand).normalized(); lat = (hp("index_01_r") - hp("pinky_01_r")).normalized()
n = a.cross(lat).normalized()
if (tl("middle_03_r") - (mid0 + (B["middle_01_r"].tail_local - mid0).normalized() * (tl("middle_03_r") - mid0).length)).dot(n) < 0: n = -n
heel = hand.lerp(hp("pinky_01_r"), 0.35) - a * 0.01
web = hp("index_01_r").lerp(hp("thumb_02_r"), 0.5)
g = web - heel; g = (g - g.dot(n) * n).normalized()

# palm skin only (hand_r dominant, NOT finger bones) and only the palmar side (in front of the palm plane)
hidx = body.vertex_groups["hand_r"].index
fing_idx = [gr.index for gr in body.vertex_groups if gr.name.endswith("_r") and gr.name.split("_")[0] in ("thumb", "index", "middle", "ring", "pinky")]
centre0 = hand.lerp(mid0, 0.55)
palm_pts = []
for v in body.data.vertices:
    wh = sum(gg.weight for gg in v.groups if gg.group == hidx)
    wf = sum(gg.weight for gg in v.groups if gg.group in fing_idx)
    p = body.matrix_world @ v.co
    if wh > 0.6 and wf < 0.2 and (p - centre0).dot(n) > -0.002:
        palm_pts.append(p)
def dist_line(p, o, d):
    v = p - o; return (v - v.dot(d) * d).length
# place handle axis: through centre0 + n*h, solve h = smallest offset with no palm point inside radius
lo, hi = 0.0, 0.06
for _ in range(30):
    h = 0.5 * (lo + hi); C = centre0 + n * h
    inside = sum(1 for p in palm_pts if -0.07 < (p - C).dot(g) < 0.07 and dist_line(p, C, g) < GRIP_R + 0.0008)
    if inside: lo = h
    else: hi = h
C = centre0 + n * hi
print("HANDLE_OFFSET_FROM_PALM_CENTRE_M", round(hi, 4), "palm_pts", len(palm_pts))

GRIP_ANGLE = math.radians(40.0)
face = (Quaternion(g, GRIP_ANGLE) @ n).normalized()
x = g.cross(face).normalized(); face = x.cross(g).normalized()
R = Matrix((x, g, face)).transposed()
GRIP_Y = 0.075
M = Matrix.Translation(C - R @ Vector((0, GRIP_Y, 0))) @ R.to_4x4()
racket.parent = None; racket.matrix_world = M
racket.parent = rig; racket.parent_type = 'BONE'; racket.parent_bone = "hand_r"; racket.matrix_world = M
bpy.context.view_layer.update()

def flex_axis_local(bn, nrm):
    b = B[bn]; d = (b.tail_local - b.head_local).normalized(); k = d.cross(nrm).normalized()
    return (b.matrix_local.to_3x3().inverted() @ k).normalized()
def finger_pose(finger, theta, ratios=(1.0, 1.15, 0.85)):
    for i, r in zip((1, 2, 3), ratios):
        bn = f"{finger}_0{i}_r"; rig.pose.bones[bn].rotation_quaternion = Quaternion(flex_axis_local(bn, n), theta * r)
# skin vertices owned by each finger (weight > 0.5 on that finger's bones)
FV = {}
for f in ("thumb", "index", "middle", "ring", "pinky"):
    gidx = [body.vertex_groups[f"{f}_0{i}_r"].index for i in (1, 2, 3) if f"{f}_0{i}_r" in body.vertex_groups]
    FV[f] = [v.index for v in body.data.vertices if sum(gg.weight for gg in v.groups if gg.group in gidx) > 0.5]
SKIN_GAP = 0.0012
def touching(finger):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); me = ev.to_mesh()
    hit = False
    for i in FV[finger]:
        q = ev.matrix_world @ me.vertices[i].co
        if -0.08 < (q - C).dot(g) < 0.13 and dist_line(q, C, g) < GRIP_R + SKIN_GAP:
            hit = True; break
    ev.to_mesh_clear()
    return hit
curl = {}
for f in ("index", "middle", "ring", "pinky"):
    lo_t, hi_t = 0.0, math.radians(100)
    for _ in range(24):
        m = 0.5 * (lo_t + hi_t); finger_pose(f, m); bpy.context.view_layer.update()
        if touching(f): hi_t = m
        else: lo_t = m
    finger_pose(f, lo_t); bpy.context.view_layer.update(); curl[f] = round(math.degrees(lo_t), 1)
def thumb_pose(theta):
    for i, r in zip((1, 2, 3), (0.6, 1.0, 0.9)):
        bn = f"thumb_0{i}_r"; b = B[bn]; d = (b.tail_local - b.head_local).normalized()
        to = C - b.head_local; to = (to - to.dot(d) * d).normalized(); k = d.cross(to).normalized()
        rig.pose.bones[bn].rotation_quaternion = Quaternion((b.matrix_local.to_3x3().inverted() @ k).normalized(), theta * r)
lo_t, hi_t = 0.0, math.radians(80)
for _ in range(24):
    m = 0.5 * (lo_t + hi_t); thumb_pose(m)
    if touching("thumb"): hi_t = m
    else: lo_t = m
thumb_pose(lo_t); bpy.context.view_layer.update(); curl["thumb"] = round(math.degrees(lo_t), 1)

# QA on deformed skin
dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); me = ev.to_mesh()
hand_groups = [hidx] + fing_idx
ids = [v.index for v in body.data.vertices if sum(gg.weight for gg in v.groups if gg.group in hand_groups) > 0.3]
pen = cont = 0; depth = 0.0; pen_by = {}
gi_all = {gr.index: gr.name for gr in body.vertex_groups}
for i in ids:
    p = ev.matrix_world @ me.vertices[i].co
    if not (-0.075 < (p - C).dot(g) < 0.12): continue
    d = dist_line(p, C, g)
    if d < GRIP_R - 0.002:
        pen += 1; depth = max(depth, GRIP_R - d)
        top = max(body.data.vertices[i].groups, key=lambda gg: gg.weight)
        nm = gi_all.get(top.group, "?"); pen_by[nm] = pen_by.get(nm, 0) + 1
    if d < GRIP_R + 0.005: cont += 1
ev.to_mesh_clear()
print("GRIP_PEN_BY_BONE", pen_by)
print("GRIP_CURL_DEG", curl)
print("GRIP_QA penetrating", pen, "max_depth_mm", round(depth * 1000, 1), "contact", cont)
G["grip_q"] = {pb.name: list(pb.rotation_quaternion) for pb in rig.pose.bones
               if pb.name.endswith("_r") and pb.name.split("_")[0] in ("thumb", "index", "middle", "ring", "pinky")}
G["grip"] = {"curl_deg": curl, "penetrating_verts": pen, "max_penetration_mm": round(depth * 1000, 1), "contact_verts": cont,
             "grip_angle_deg": 40.0, "handle_offset_m": round(hi, 4)}
json.dump(G, open(os.path.join(ROOT, "qa", "grip.json"), "w"), indent=1)
reset(rig)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
print("SAVED")
