"""Step 5b: extreme-pose deformation stress test.
Poses: serve trophy (max shoulder ER), racket-drop, contact (full reach), deep lunge, trunk twist.
Metric per pose: edge stretch/compress distribution + collapsed faces on body & shirt, joint angles vs human limits.
Writes qa/stress.json and renders a pose sheet."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import *
from common import setup_render, add_lights, ground, camera, render

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
rig = bpy.data.objects["Kai_Rig"]
G = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
body, shirt = bpy.data.objects["Kai_Body"], bpy.data.objects["Kai_Shirt"]
REST = {o.name: ([(o.data.vertices[e.vertices[0]].co - o.data.vertices[e.vertices[1]].co).length for e in o.data.edges],
                 [p.area for p in o.data.polygons]) for o in (body, shirt)}
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

def apply_grip():
    for k, q in G["grip_q"].items(): rig.pose.bones[k].rotation_quaternion = Quaternion(q)

def arm_to(side, elbow_dir, hand_dir):
    aim_bone(rig, "upperarm_" + side, elbow_dir); bpy.context.view_layer.update()
    aim_bone(rig, "lowerarm_" + side, hand_dir); bpy.context.view_layer.update()

POSES = {}
def pose_trophy():
    reset(rig); apply_grip()
    chain_rot(rig, [("pelvis", Z, 35), ("spine_02", Z, 25), ("spine_03", Z, 20),
                    ("spine_02", Y, 10), ("spine_03", Y, 8), ("spine_03", X, -10)])
    for s in ("l", "r"):
        chain_rot(rig, [("thigh_" + s, X, -35), ("calf_" + s, X, 60), ("foot_" + s, X, -25)])
    # right: shoulder abducted ~100 deg, elbow ~100 deg, forearm up/back (ER ~ 90 at trophy)
    arm_to("r", Vector((-1, 0.25, 0.25)), Vector((-0.1, 0.35, 1)))
    # left: tossing arm straight up
    arm_to("l", Vector((0.15, -0.2, 1)), Vector((0.1, -0.15, 1)))
POSES["trophy"] = pose_trophy

def pose_racket_drop():
    reset(rig); apply_grip()
    chain_rot(rig, [("pelvis", Z, 15), ("spine_02", Z, 10), ("spine_03", Y, 12), ("spine_03", X, -18)])
    # max external rotation: upper arm abducted ~100, forearm pointing back/down behind head (ER ~ 170)
    arm_to("r", Vector((-1, 0.15, 0.30)), Vector((0.05, 0.55, -0.85)))
    aim_bone(rig, "hand_r", Vector((0.0, 0.6, -0.8)))
    arm_to("l", Vector((0.5, -0.6, -0.4)), Vector((0.2, -0.9, -0.2)))
POSES["racket_drop"] = pose_racket_drop

def pose_contact():
    reset(rig); apply_grip()
    chain_rot(rig, [("pelvis", Z, -10), ("spine_02", Z, -15), ("spine_03", Y, -18), ("spine_03", X, 5)])
    arm_to("r", Vector((-0.25, -0.15, 1)), Vector((-0.1, -0.25, 1)))
    arm_to("l", Vector((0.3, -0.6, -0.6)), Vector((0.0, -0.4, -0.9)))
POSES["contact"] = pose_contact

def pose_lunge():
    reset(rig); apply_grip()
    chain_rot(rig, [("thigh_r", X, -95), ("calf_r", X, 105), ("foot_r", X, -10),
                    ("thigh_l", X, 25), ("calf_l", X, 70), ("spine_01", X, 15)])
    arm_to("r", Vector((-0.6, -0.7, -0.2)), Vector((-0.4, -0.9, 0.1)))
POSES["deep_lunge"] = pose_lunge

def pose_twist():
    reset(rig); apply_grip()
    chain_rot(rig, [("pelvis", Z, 45), ("spine_01", Z, 15), ("spine_02", Z, 20), ("spine_03", Z, 25), ("neck_01", Z, -40)])
    arm_to("r", Vector((-0.7, 0.6, -0.2)), Vector((-0.2, 0.9, 0.1)))
    arm_to("l", Vector((0.6, -0.7, -0.1)), Vector((-0.2, -0.95, 0.1)))
POSES["trunk_twist"] = pose_twist

LIMITS = {"elbow_r": (0, 150), "knee_l": (0, 155), "knee_r": (0, 155)}
HAND = ("hand_", "thumb_", "index_", "middle_", "ring_", "pinky_")
def region_mask(o):
    gi = {g.index: g.name for g in o.vertex_groups}
    m = []
    for v in o.data.vertices:
        w = sum(g.weight for g in v.groups if (gi.get(g.group) or "").startswith(HAND))
        m.append(w > 0.5)
    return m
MASK = {o.name: region_mask(o) for o in (body, shirt)}
def strain_split(o):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); me = ev.to_mesh()
    out = {}
    for part in ("hands", "rest"):
        rs = []
        for e, L0 in zip(o.data.edges, REST[o.name][0]):
            a, b = e.vertices
            isH = MASK[o.name][a] or MASK[o.name][b]
            if (part == "hands") != isH or L0 < 1e-6: continue
            rs.append((me.vertices[a].co - me.vertices[b].co).length / L0)
        if not rs: continue
        rs.sort(); n = len(rs)
        out[part] = {"p01": round(rs[int(n * .01)], 3), "p99": round(rs[int(n * .99)], 3), "min": round(rs[0], 3), "max": round(rs[-1], 3),
                     "edges_over_1_6": sum(1 for x in rs if x > 1.6), "edges_under_0_4": sum(1 for x in rs if x < 0.4), "n": n}
    ev.to_mesh_clear()
    return out
report = {}
setup_render((560, 760)); add_lights(); ground()
rig.hide_render = True
bpy.data.objects["Kai_Ball"].hide_render = True
for name, fn in POSES.items():
    fn(); bpy.context.view_layer.update()
    r = {"angles": {"elbow_r": round(joint_angle(rig, "upperarm_r", "lowerarm_r"), 1),
                    "knee_l": round(joint_angle(rig, "thigh_l", "calf_l"), 1),
                    "knee_r": round(joint_angle(rig, "thigh_r", "calf_r"), 1)}}
    for o in (body, shirt):
        r[o.name] = {**strain_split(o), **face_area_ratio(o, REST[o.name][1], MASK[o.name])}
    r["angle_ok"] = all(LIMITS[k][0] <= v <= LIMITS[k][1] for k, v in r["angles"].items())
    report[name] = r
    print("STRESS", name, json.dumps(r))
    for v, loc in (("a", (3.2, -3.4, 1.3)), ("b", (-3.2, -2.0, 1.4))):
        cam = camera("QA_Cam_s" + v, loc, (0, 0, 1.05), lens=55)
        render(os.path.join(ROOT, "renders", f"stress_{name}_{v}.png"), cam)
json.dump(report, open(os.path.join(ROOT, "qa", "stress.json"), "w"), indent=1)
print("DONE")
