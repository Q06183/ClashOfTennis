"""Anatomical IK helpers (math-only where possible, so they are fast and exact).
hinge_solve: 2-bone IK where the lower joint is a TRUE hinge (no twist at elbow/knee), the bend plane is set by
a pole direction, and bone roll is derived from the rest hinge axis.  Returns armature-space 3x3 matrices."""
import bpy, math
from mathutils import Vector, Matrix, Quaternion

def frame_from_axes(y_world, h_world, y_local, h_local):
    """rotation M with M @ y_local = y_world and M @ h_local ~ h_world (h orthogonalised)."""
    yw = y_world.normalized(); hw = (h_world - h_world.dot(yw) * yw).normalized()
    yl = y_local.normalized(); hl = (h_local - h_local.dot(yl) * yl).normalized()
    W = Matrix((yw, hw, yw.cross(hw))).transposed()
    L = Matrix((yl, hl, yl.cross(hl))).transposed()
    return W @ L.transposed()

def rest3(rig, b): return rig.data.bones[b].matrix_local.to_3x3()

def base3(rig, b):
    """armature-space 3x3 of bone b with identity local rotation (given current parent pose)"""
    pb = rig.pose.bones[b]
    if pb.parent is None: return rest3(rig, b)
    return pb.parent.matrix.to_3x3() @ rest3(rig, pb.parent.name).inverted() @ rest3(rig, b)

def set_world3(rig, b, M3, base=None):
    if base is None: base = base3(rig, b)
    rig.pose.bones[b].rotation_quaternion = (base.inverted() @ M3).to_quaternion()

def hinge_solve(rig, upper, lower, shoulder, target, pole_dir, parent3=None):
    """returns (M_upper, M_lower, elbow_pos, reach_ok). parent3 = armature-space 3x3 of upper's parent."""
    bu, bl = rig.data.bones[upper], rig.data.bones[lower]
    la, lb = bu.length, bl.length
    ru, rl = bu.matrix_local.to_3x3(), bl.matrix_local.to_3x3()
    du0, dl0 = ru.col[1].normalized(), rl.col[1].normalized()
    n0 = du0.cross(dl0)
    if n0.length < 1e-4: n0 = ru.col[0]
    n0.normalize()
    h_u = ru.inverted() @ n0; h_l = rl.inverted() @ n0
    flex0 = du0.angle(dl0)
    d = target - shoulder; L = d.length; a = d.normalized()
    reach_ok = L <= (la + lb) * 0.9995
    L = min(max(L, abs(la - lb) + 1e-4), (la + lb) * 0.9995)
    cosA = max(-1.0, min(1.0, (la * la + L * L - lb * lb) / (2 * la * L)))
    al = math.acos(cosA)
    p = (pole_dir - pole_dir.dot(a) * a)
    if p.length < 1e-6:
        p = a.orthogonal()
    p.normalize()
    E = shoulder + (a * math.cos(al) + p * math.sin(al)) * la
    du = (E - shoulder).normalized(); dl = (shoulder + a * L - E).normalized()
    n = p.cross(a).normalized()
    Mu = frame_from_axes(du, n, Vector((0, 1, 0)), h_u)
    flex = du.angle(dl)
    ql = Quaternion(h_l.normalized(), flex - flex0)
    Ml = Mu @ ru.inverted() @ rl @ ql.to_matrix()
    return Mu, Ml, E, reach_ok

def swing_twist_local(q, axis=Vector((0, 1, 0))):
    """decompose q = swing * twist (twist about axis). returns (swing_angle_deg, twist_angle_deg signed)"""
    v = Vector((q.x, q.y, q.z)); proj = axis * v.dot(axis)
    tw = Quaternion((q.w, proj.x, proj.y, proj.z))
    if tw.magnitude < 1e-9: return math.degrees(2 * math.acos(min(1, abs(q.w)))), 0.0
    tw.normalize()
    sw = q @ tw.inverted()
    ang = 2 * math.degrees(math.atan2(Vector((tw.x, tw.y, tw.z)).dot(axis), tw.w))
    if ang > 180: ang -= 360
    if ang < -180: ang += 360
    return math.degrees(2 * math.acos(min(1.0, abs(sw.w)))), ang

def clamp_hand(q, swing_max_deg, twist_lo, twist_hi, axis=Vector((0, 1, 0))):
    v = Vector((q.x, q.y, q.z)); proj = axis * v.dot(axis)
    tw = Quaternion((q.w, proj.x, proj.y, proj.z))
    if tw.magnitude < 1e-9: tw = Quaternion()
    tw.normalize(); sw = q @ tw.inverted()
    t_ang = 2 * math.atan2(Vector((tw.x, tw.y, tw.z)).dot(axis), tw.w)
    if t_ang > math.pi: t_ang -= 2 * math.pi
    if t_ang < -math.pi: t_ang += 2 * math.pi
    t_ang = max(math.radians(twist_lo), min(math.radians(twist_hi), t_ang))
    s_ang = 2 * math.acos(min(1.0, abs(sw.w)))
    if s_ang > math.radians(swing_max_deg) and s_ang > 1e-6:
        sw_axis = Vector((sw.x, sw.y, sw.z)).normalized() * (1 if sw.w >= 0 else -1)
        sw = Quaternion(sw_axis, math.radians(swing_max_deg))
    return sw @ Quaternion(axis, t_ang)
