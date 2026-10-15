"""Step 5a: rig hardening for deformation quality.
- adds upper-arm and forearm twist bones (game-engine standard) and splits skin weights onto them,
  so 170 deg shoulder external rotation and forearm pronation do not candy-wrap the skin;
- quaternion rotation mode everywhere;
- solves a continental grip: racket placed in the right palm, fingers curled until they touch the handle;
- solves a left-hand ball hold.
Writes kai_04_rigged.blend and qa/grip.json."""
import bpy, bmesh, os, sys, json, math
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "kai_03_outfit.blend"))
rig = bpy.data.objects["Kai_Rig"]
assert rig.matrix_world == Matrix.Identity(4), rig.matrix_world

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

# ---------- twist bones
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
for s in ("l", "r"):
    for src, name, t0, t1 in (("upperarm_" + s, "upperarm_twist_01_" + s, 0.0, 0.5),
                              ("lowerarm_" + s, "lowerarm_twist_01_" + s, 0.5, 1.0)):
        if name in eb: continue
        b = eb[src]; n = eb.new(name)
        n.head = b.head.lerp(b.tail, t0); n.tail = b.head.lerp(b.tail, t1)
        n.roll = b.roll; n.parent = b; n.use_connect = False; n.use_deform = True
        # align roll exactly to source bone frame
        n.align_roll(b.z_axis)
bpy.ops.object.mode_set(mode='OBJECT')
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'

B = {b.name: b for b in rig.data.bones}
def t_along(p, bn):
    b = B[bn]; h, t = b.head_local, b.tail_local; d = t - h
    return (p - h).dot(d) / d.length_squared

skinned = [o for o in bpy.data.objects if o.type == 'MESH' and len(o.vertex_groups) > 4]
for o in skinned:
    mw = o.matrix_world
    for s in ("l", "r"):
        for src, tw, fn in (("upperarm_" + s, "upperarm_twist_01_" + s, lambda t: 1 - smooth(0.05, 0.65, t)),
                            ("lowerarm_" + s, "lowerarm_twist_01_" + s, lambda t: smooth(0.25, 0.90, t))):
            if src not in o.vertex_groups: continue
            gs = o.vertex_groups[src]; gt = o.vertex_groups.get(tw) or o.vertex_groups.new(name=tw)
            moved = 0
            for v in o.data.vertices:
                w = next((g.weight for g in v.groups if g.group == gs.index), 0.0)
                if w <= 0: continue
                k = fn(t_along(mw @ v.co, src)) * 0.6       # twist bone carries 60% of the region
                if k <= 1e-4: continue
                gs.add([v.index], w * (1 - k), 'REPLACE'); gt.add([v.index], w * k, 'REPLACE'); moved += 1
            print("TWIST_SPLIT", o.name, tw, moved)

# ---------- hand geometry (rest)
def hp(n): return B[n].head_local.copy()
def tl(n): return B[n].tail_local.copy()
body = bpy.data.objects["Kai_Body"]
dg = bpy.context.evaluated_depsgraph_get()
bvh_body = BVHTree.FromObject(body, dg)

def palm_frame(s):
    hand = hp("hand_" + s)
    mid0, mid3 = hp("middle_01_" + s), tl("middle_03_" + s)
    idx0, pin0 = hp("index_01_" + s), hp("pinky_01_" + s)
    a = (mid0 - hand).normalized()                         # fingers direction
    lat = (idx0 - pin0).normalized()
    n = a.cross(lat).normalized()
    # palm side = where the resting curled fingertips are
    straight = mid0 + (B["middle_01_" + s].tail_local - mid0).normalized() * (mid3 - mid0).length
    if (mid3 - straight).dot(n) < 0: n = -n
    centre = hand.lerp(mid0, 0.55)
    return centre, n, a, lat

res = {}
# ---------- right hand: continental grip
c, n, a, lat = palm_frame("r")
hit = bvh_body.ray_cast(c - n * 0.03, n, 0.08)
skin = hit[0] if hit[0] is not None else c + n * 0.012
GRIP_R = 0.0165
C = skin + n * (GRIP_R + 0.0015)
heel = hp("hand_r").lerp(hp("pinky_01_r"), 0.35) - a * 0.01
web = hp("index_01_r").lerp(hp("thumb_02_r"), 0.5)
g = (web - heel); g = (g - g.dot(n) * n).normalized()
GRIP_ANGLE = math.radians(40.0)                             # continental: face rotated ~40 deg from palm normal
face = (Quaternion(g, GRIP_ANGLE) @ n).normalized()
x = g.cross(face).normalized(); face = x.cross(g).normalized()
R = Matrix((x, g, face)).transposed()                       # racket local axes X, Y(butt->tip), Z(face normal)
GRIP_Y = 0.070                                              # racket local y of the palm centre
racket = bpy.data.objects["Kai_Racket"]
racket.parent = None
M = Matrix.Translation(C - R @ Vector((0, GRIP_Y, 0))) @ R.to_4x4()
racket.matrix_world = M
racket.parent = rig; racket.parent_type = 'BONE'; racket.parent_bone = "hand_r"
racket.matrix_world = M
bpy.context.view_layer.update()
print("RACKET_IN_HAND_OK", (racket.matrix_world.translation - M.translation).length < 1e-5)

# ---------- finger grasp solve (bisection on contact distance to the handle axis)
def flex_axis_local(bn, nrm):
    b = B[bn]; d = (b.tail_local - b.head_local).normalized()
    k = d.cross(nrm).normalized()                            # rotating d about k moves it toward nrm
    return (b.matrix_local.to_3x3().inverted() @ k).normalized()

def dist_line(p, o, d):
    v = p - o; return (v - v.dot(d) * d).length

def finger_pose(s, finger, theta, nrm, ratios=(1.0, 1.15, 0.85)):
    for i, r in zip((1, 2, 3), ratios):
        bn = f"{finger}_0{i}_{s}"
        rig.pose.bones[bn].rotation_quaternion = Quaternion(flex_axis_local(bn, nrm), theta * r)

def tip(bn):
    pb = rig.pose.bones[bn]; return (rig.matrix_world @ pb.tail).copy()

def solve_curl(s, finger, target_fn, nrm, hi=math.radians(95)):
    lo_t, hi_t = 0.0, hi
    for _ in range(22):
        mid = 0.5 * (lo_t + hi_t)
        finger_pose(s, finger, mid, nrm); bpy.context.view_layer.update()
        if target_fn(): hi_t = mid
        else: lo_t = mid
    finger_pose(s, finger, lo_t, nrm); bpy.context.view_layer.update()
    return lo_t

FINGER_R = 0.0085
def touches_handle(finger, s="r"):
    def f():
        for i in (2, 3):
            pb = rig.pose.bones[f"{finger}_0{i}_{s}"]
            for p in (pb.head, pb.tail):
                if dist_line(rig.matrix_world @ p, C, g) < GRIP_R + FINGER_R: return True
        return False
    return f
grip = {}
for fing in ("index", "middle", "ring", "pinky"):
    th = solve_curl("r", fing, touches_handle(fing), n)
    grip[fing] = math.degrees(th)
# thumb wraps over the handle from the other side
def thumb_pose(theta):
    for i, r in zip((1, 2, 3), (0.6, 1.0, 0.9)):
        bn = f"thumb_0{i}_r"; b = B[bn]; d = (b.tail_local - b.head_local).normalized()
        toward = (C - b.head_local); toward = (toward - toward.dot(d) * d).normalized()
        k = d.cross(toward).normalized()
        rig.pose.bones[bn].rotation_quaternion = Quaternion((b.matrix_local.to_3x3().inverted() @ k).normalized(), theta * r)
def thumb_touch():
    for i in (2, 3):
        pb = rig.pose.bones[f"thumb_0{i}_r"]
        if dist_line(rig.matrix_world @ pb.tail, C, g) < GRIP_R + FINGER_R: return True
    return False
lo_t, hi_t = 0.0, math.radians(80)
for _ in range(22):
    mid = 0.5 * (lo_t + hi_t); thumb_pose(mid); bpy.context.view_layer.update()
    if thumb_touch(): hi_t = mid
    else: lo_t = mid
thumb_pose(lo_t); bpy.context.view_layer.update(); grip["thumb"] = math.degrees(lo_t)
grip_q = {pb.name: list(pb.rotation_quaternion) for pb in rig.pose.bones
          if pb.name.endswith("_r") and pb.name.split("_")[0] in ("thumb", "index", "middle", "ring", "pinky")}
print("GRIP_CURL_DEG", {k: round(v, 1) for k, v in grip.items()})

# grip QA: hand-skin vertices inside the handle volume
bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(dg); me = ev.to_mesh()
hand_ids = set()
for gname in [g.name for g in body.vertex_groups if g.name.endswith("_r") and g.name.split("_")[0] in ("hand", "thumb", "index", "middle", "ring", "pinky")]:
    gi = body.vertex_groups[gname].index
    for v in body.data.vertices:
        if any(gg.group == gi and gg.weight > 0.3 for gg in v.groups): hand_ids.add(v.index)
inside = 0; near = 0
for i in hand_ids:
    p = ev.matrix_world @ me.vertices[i].co
    t = (p - C).dot(g)
    if -0.075 < t < 0.12:
        dd = dist_line(p, C, g)
        if dd < GRIP_R - 0.002: inside += 1
        if dd < GRIP_R + 0.006: near += 1
print("GRIP_QA hand_verts", len(hand_ids), "penetrating", inside, "in_contact", near)
ev.to_mesh_clear()
res["grip"] = {"curl_deg": grip, "penetrating_verts": inside, "contact_verts": near, "grip_angle_deg": 40.0}
res["grip_q"] = grip_q

# ---------- left hand: ball hold (palm up cup), ball centre in front of palm
for pb in rig.pose.bones:
    if pb.name.endswith("_l") and pb.name.split("_")[0] in ("thumb", "index", "middle", "ring", "pinky"):
        pb.rotation_quaternion = Quaternion()
bpy.context.view_layer.update()
cl, nl, al, latl = palm_frame("l")
hit = bvh_body.ray_cast(cl - nl * 0.03, nl, 0.08)
skin_l = hit[0] if hit[0] is not None else cl + nl * 0.012
BALL_R = 0.0335
ball_c = skin_l + nl * (BALL_R + 0.002) + al * 0.012
def touches_ball(finger):
    def f():
        pb = rig.pose.bones[f"{finger}_03_l"]
        return (rig.matrix_world @ pb.tail - ball_c).length < BALL_R + FINGER_R or \
               (rig.matrix_world @ pb.head - ball_c).length < BALL_R + FINGER_R
    return f
hold = {}
for fing in ("index", "middle", "ring", "pinky"):
    hold[fing] = math.degrees(solve_curl("l", fing, touches_ball(fing), nl, hi=math.radians(70)))
hold_q = {pb.name: list(pb.rotation_quaternion) for pb in rig.pose.bones
          if pb.name.endswith("_l") and pb.name.split("_")[0] in ("thumb", "index", "middle", "ring", "pinky")}
print("BALL_HOLD_CURL_DEG", {k: round(v, 1) for k, v in hold.items()})
hand_l = B["hand_l"].matrix_local
res["ball_in_hand_local"] = list(hand_l.inverted() @ ball_c)
res["hold_q"] = hold_q
res["racket_sweet_local"] = [0.0, 0.50, 0.0]
for pb in rig.pose.bones:
    pb.rotation_quaternion = Quaternion(); pb.location = Vector()
json.dump(res, open(os.path.join(OUT, "qa", "grip.json"), "w"), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kai_04_rigged.blend"))
print("SAVED")
