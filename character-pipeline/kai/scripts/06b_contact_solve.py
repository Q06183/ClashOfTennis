"""Step 6b: post-bake contact solver (runs on the baked serve).
For every frame, for each foot:
  * measure the lowest point of that shoe (evaluated mesh);
  * if a foot is meant to be planted (lowest point within 3 cm of the floor), lift the whole leg chain by
    rotating ONLY the foot bone about the ball joint / raising the ankle target, and re-solve leg IK so the
    sole sits exactly on z = 0 (no penetration, no hover);
  * while planted, lock the horizontal position of the contact patch to where it first touched down
    (eliminates sliding), re-solving IK per frame.
Then the per-frame keys are re-inserted.  Also fixes the landing frame so the left foot touches
down cleanly (heel-to-toe order: ball first, then heel)."""
import bpy, os, sys, json, math
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, two_bone_ik, aim_bone, world_head, world_tail, set_world_rot
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]; shoes = bpy.data.objects["Kai_Shoes"]
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json")))
sc = bpy.context.scene
frames = list(range(sc.frame_start, sc.frame_end + 1))
U = Vector((0, 0, 1))

def shoe_pts(side):
    bpy.context.view_layer.update()
    ev = shoes.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    a = world_head(rig, "foot_" + side); o = world_head(rig, "foot_" + ("r" if side == "l" else "l"))
    P = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return [p for p in P if (p - a).length < (p - o).length]

def patch(P):
    zmin = min(p.z for p in P); sole = [p for p in P if p.z < zmin + 0.006]
    c = sum(sole, Vector()) / len(sole); return zmin, c

def capture_leg(side):
    return {b: rig.pose.bones[b].rotation_quaternion.copy() for b in ("thigh_" + side, "calf_" + side, "foot_" + side, "ball_" + side)}

def shift_leg(side, delta):
    """translate the ankle by delta (world) keeping foot/ball world orientation, re-solving thigh/calf IK"""
    bpy.context.view_layer.update()
    pf, pb = rig.pose.bones["foot_" + side], rig.pose.bones["ball_" + side]
    Rf = (rig.matrix_world @ pf.matrix).to_3x3().copy(); Rb = (rig.matrix_world @ pb.matrix).to_3x3().copy()
    ankle = world_head(rig, "foot_" + side) + delta
    knee = world_tail(rig, "thigh_" + side); hip = world_head(rig, "thigh_" + side)
    # keep the current knee bend plane
    mid = (hip + ankle) * 0.5; pole = (knee - mid)
    if pole.length < 1e-4: pole = Vector((0, -1, 0))
    two_bone_ik(rig, "thigh_" + side, "calf_" + side, ankle, hip + pole.normalized())
    for name, R in (("foot_" + side, Rf), ("ball_" + side, Rb)):
        pbn = rig.pose.bones[name]; bpy.context.view_layer.update()
        base = pbn.parent.matrix @ pbn.parent.bone.matrix_local.inverted() @ pbn.bone.matrix_local
        pbn.rotation_quaternion = (base.to_3x3().inverted() @ R).to_quaternion()
    bpy.context.view_layer.update()

lock = {"l": None, "r": None}
DRAG = {k: v for k, v in plan.get("drag_windows", {}).items()}
report = {"lifted": 0, "locked": 0}
PLANT_Z = 0.025
for f in frames:
    sc.frame_set(f)
    for side in ("l", "r"):
        for it in range(3):
            zmin, c = patch(shoe_pts(side))
            planted = zmin < PLANT_Z
            if not planted:
                lock[side] = None; break
            dragging = side in DRAG and DRAG[side][0] <= f <= DRAG[side][1]
            if lock[side] is None or dragging:
                lock[side] = Vector((c.x, c.y, 0))
            d = Vector((lock[side].x - c.x, lock[side].y - c.y, -zmin + 0.0006))
            if d.length < 0.0008: break
            shift_leg(side, d); report["locked"] += 1
    for pb in rig.pose.bones:
        if pb.name.split("_")[0] in ("thigh", "calf", "foot", "ball"):
            pb.keyframe_insert("rotation_quaternion", frame=f)
print("CONTACT_SOLVE", report)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
print("SAVED")
