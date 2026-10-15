"""Shared pose library + measurement utilities for Kai (Blender 5.2, MPFB game_engine rig + twist bones).
Pose values are expressed as anatomical joint angles and converted into bone-local quaternions using
world-space axes, so they are independent of bone roll conventions."""
import bpy, math, json, os
from mathutils import Vector, Quaternion, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# world: character faces -Y, up +Z, character's left = +X.

def rest_mats(rig):
    return {b.name: b.matrix_local.copy() for b in rig.data.bones}

def set_world_rot(rig, bname, q_world_delta):
    """Apply a world-space rotation delta (about the bone head) relative to the bone's *current parent chain*.
    Implemented by converting into bone-local space using the posed parent matrix."""
    pb = rig.pose.bones[bname]
    bpy.context.view_layer.update()
    # current posed matrix (armature space) without this bone's own rotation
    rest = pb.bone.matrix_local
    if pb.parent:
        parent_pose = pb.parent.matrix
        parent_rest = pb.parent.bone.matrix_local
        base = parent_pose @ parent_rest.inverted() @ rest
    else:
        base = rest
    target = q_world_delta.to_matrix().to_4x4() @ base
    target.translation = base.translation
    local = base.inverted() @ target
    pb.rotation_quaternion = local.to_quaternion()

def chain_rot(rig, items):
    """items: list of (bone, axis(world Vector), degrees) applied in hierarchy order, each composed in world space."""
    acc = {}
    for bname, axis, deg in items:
        acc.setdefault(bname, Quaternion())
        acc[bname] = Quaternion(Vector(axis).normalized(), math.radians(deg)) @ acc[bname]
    order = [b.name for b in rig.data.bones]  # bones are stored parents-first
    for bname in order:
        if bname in acc:
            set_world_rot(rig, bname, acc[bname])

def aim_bone(rig, bname, direction, twist_ref=None):
    """Rotate bone so its Y axis points along `direction` (world), with minimal rotation from current pose."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bname]
    cur = (pb.matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    set_world_rot(rig, bname, q @ current_world_delta(rig, bname))

def current_world_delta(rig, bname):
    pb = rig.pose.bones[bname]
    rest = pb.bone.matrix_local
    if pb.parent:
        base = pb.parent.matrix @ pb.parent.bone.matrix_local.inverted() @ rest
    else:
        base = rest
    return (pb.matrix.to_3x3() @ base.to_3x3().inverted()).to_quaternion()

def reset(rig):
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion(); pb.location = Vector(); pb.scale = Vector((1, 1, 1))
    bpy.context.view_layer.update()

def two_bone_ik(rig, upper, lower, end_target, pole_dir):
    """Analytic two-bone IK in world space: places `lower` tail at end_target with bend plane given by pole_dir."""
    bpy.context.view_layer.update()
    pu, pl = rig.pose.bones[upper], rig.pose.bones[lower]
    A = rig.matrix_world @ pu.head
    la, lb = pu.bone.length, pl.bone.length
    T = Vector(end_target); d = T - A; L = min(d.length, (la + lb) * 0.9995); dn = d.normalized()
    cosA = max(-1, min(1, (la * la + L * L - lb * lb) / (2 * la * L)))
    ang = math.acos(cosA)
    pole = (Vector(pole_dir) - Vector(pole_dir).dot(dn) * dn).normalized()
    elbow = A + (dn * math.cos(ang) + pole * math.sin(ang)) * la
    aim_bone(rig, upper, elbow - A)
    bpy.context.view_layer.update()
    aim_bone(rig, lower, T - elbow)
    bpy.context.view_layer.update()
    return elbow

def world_head(rig, b): return rig.matrix_world @ rig.pose.bones[b].head
def world_tail(rig, b): return rig.matrix_world @ rig.pose.bones[b].tail

def joint_angle(rig, a, b):
    """angle between bone a direction and bone b direction (0 = straight)"""
    pa, pb = rig.pose.bones[a], rig.pose.bones[b]
    da = (pa.tail - pa.head).normalized(); db = (pb.tail - pb.head).normalized()
    return math.degrees(da.angle(db))

def edge_strain(obj, rest_lengths=None):
    """Return (max_ratio, min_ratio, p99 stretch, p1 compress) of evaluated edge lengths vs rest."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg); me = ev.to_mesh()
    if rest_lengths is None:
        rest_lengths = [(obj.data.vertices[e.vertices[0]].co - obj.data.vertices[e.vertices[1]].co).length for e in obj.data.edges]
    r = []
    for e, L0 in zip(me.edges, rest_lengths):
        if L0 < 1e-6: continue
        L = (me.vertices[e.vertices[0]].co - me.vertices[e.vertices[1]].co).length
        r.append(L / L0)
    ev.to_mesh_clear()
    r.sort()
    n = len(r)
    return {"max": round(r[-1], 3), "min": round(r[0], 3), "p99": round(r[int(n * 0.99)], 3), "p01": round(r[int(n * 0.01)], 3),
            "over_1_5": sum(1 for x in r if x > 1.5), "under_0_5": sum(1 for x in r if x < 0.5)}

def face_area_ratio(obj, rest_areas=None, hand_mask=None):
    """collapsed-face count, split into hand region (finger creases) and the rest of the body."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg); me = ev.to_mesh()
    if rest_areas is None:
        rest_areas = [p.area for p in obj.data.polygons]
    bad = {"hands": 0, "rest": 0}; worst = {"hands": 1.0, "rest": 1.0}
    for p, p0, a0 in zip(me.polygons, obj.data.polygons, rest_areas):
        if a0 < 1e-9: continue
        part = "hands" if (hand_mask and any(hand_mask[i] for i in p0.vertices)) else "rest"
        k = p.area / a0
        worst[part] = min(worst[part], k)
        if k < 0.25: bad[part] += 1
    ev.to_mesh_clear()
    return {"collapsed_faces_lt25pct": bad, "min_area_ratio": {k: round(v, 3) for k, v in worst.items()}}
