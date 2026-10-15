"""Step 4b fix: short athletic hair built from the scalp region + ray-projected brows + headband."""
import bpy, bmesh, os, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "kai_03_outfit.blend"))
rig = bpy.data.objects["Kai_Rig"]; body = bpy.data.objects["Kai_Body"]
coll = body.users_collection[0]
for n in ("Kai_Hair", "Kai_Brows"):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
M = bpy.data.materials
eyeL = bpy.data.objects["Kai_Eye_L"]
ec = sum((v.co for v in eyeL.data.vertices), Vector()) / len(eyeL.data.vertices)
EYE_Z, EYE_Y = ec.z, ec.y
print("EYE_C", tuple(round(x, 4) for x in ec))

def activate(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o

def skinned_rigid(obj, bone="head"):
    obj.parent = rig; obj.vertex_groups.clear()
    g = obj.vertex_groups.new(name=bone); g.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    md = obj.modifiers.new("Armature", 'ARMATURE'); md.object = rig

me = body.data
hi = body.vertex_groups["head"].index
neck_i = body.vertex_groups["neck_01"].index
def w(v, gi):
    for g in v.groups:
        if g.group == gi: return g.weight
    return 0.0
head_pts = [(v.index, v.co.copy()) for v in me.vertices if w(v, hi) > 0.35]
zs = [p.z for _, p in head_pts]; ztop = max(zs)
cy = sum(p.y for _, p in head_pts) / len(head_pts)
print("HEAD_TOP", round(ztop, 4), "CY", round(cy, 4))
# ear band: exclude vertices near ears (|x| large, z between eye-0.05 and eye+0.02, y near cy)
def is_scalp(p):
    hairline_front = EYE_Z + 0.050          # forehead hairline
    if p.z > hairline_front: return True
    back = p.y - EYE_Y                      # >0 behind the eyes
    if back > 0.085 and p.z > EYE_Z - 0.055:   # back of head down to nape
        return True
    if back > 0.050 and p.z > EYE_Z + 0.005 and abs(p.x) > 0.055:  # temples/sideburn area above ears
        return True
    return False
scalp = {i for i, p in head_pts if is_scalp(p)}
# exclude ears: points that stick out laterally beyond the skull envelope at ear height
xmax_at = {}
ear = {i for i, p in head_pts if abs(p.x) > 0.072 and EYE_Z - 0.06 < p.z < EYE_Z + 0.02}
scalp -= ear
print("SCALP_VERTS", len(scalp), "EAR", len(ear))

hair = body.copy(); hair.data = body.data.copy(); hair.name = hair.data.name = "Kai_Hair"; coll.objects.link(hair)
for md in list(hair.modifiers): hair.modifiers.remove(md)
bm = bmesh.new(); bm.from_mesh(hair.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in scalp for v in f.verts)], context='FACES_ONLY')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.normal_update()
boundary = {v for v in bm.verts if v.is_boundary}
# distance (in rings) from boundary -> taper the thickness to zero at the hairline for a clean edge
dist = {v: 0 for v in boundary}; frontier = list(boundary); d = 0
while frontier:
    d += 1; nxt = []
    for v in frontier:
        for e in v.link_edges:
            o = e.other_vert(v)
            if o not in dist: dist[o] = d; nxt.append(o)
    frontier = nxt
for v in bm.verts:
    k = min(1.0, dist.get(v, 6) / 4.0)
    up = max(0.0, (v.co.z - (EYE_Z + 0.03)) / (ztop - EYE_Z - 0.03))
    front = max(0.0, min(1.0, -(v.co.y - cy) / 0.08))
    off = (0.0025 + 0.010 * up ** 1.2 + 0.006 * front * up) * k + 0.0012
    v.co += v.normal * off
bm.to_mesh(hair.data); bm.free()
hair.data.materials.clear(); hair.data.materials.append(M["Kai_Hair"])
for p in hair.data.polygons: p.use_smooth = True
for g in list(hair.vertex_groups): hair.vertex_groups.remove(g)
skinned_rigid(hair)
activate(hair)
s = hair.modifiers.new("Solid", 'SOLIDIFY'); s.thickness = 0.003; s.offset = -1
bpy.ops.object.modifier_move_to_index(modifier="Solid", index=0); bpy.ops.object.modifier_apply(modifier="Solid")
print("HAIR_FACES", len(hair.data.polygons))

# ---- headband (coral) around the head above the brows, like the reference look
bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
band_z0 = EYE_Z + 0.040
segs = 64; rows = []
for zz in (band_z0, band_z0 + 0.016, band_z0 + 0.030):
    ring = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        dirv = Vector((math.sin(a), -math.cos(a), 0))
        origin = Vector((0, cy + 0.0, zz)) + dirv * 0.3
        hit = bvh.ray_cast(origin, -dirv, 0.35)
        if hit[0] is None:
            hit = (Vector((0, cy, zz)) + dirv * 0.09, dirv)
        ring.append(hit[0] + dirv * 0.0075)
    rows.append(ring)
bm = bmesh.new()
V = [[bm.verts.new(p) for p in r] for r in rows]
for r in range(len(V) - 1):
    for k in range(segs):
        bm.faces.new((V[r][k], V[r][(k + 1) % segs], V[r + 1][(k + 1) % segs], V[r + 1][k]))
bme = bpy.data.meshes.new("Kai_Headband"); bm.to_mesh(bme); bm.free()
hb = bpy.data.objects.new("Kai_Headband", bme); coll.objects.link(hb)
bme.materials.append(M["Kai_Coral"])
for p in bme.polygons: p.use_smooth = True
skinned_rigid(hb); activate(hb)
s = hb.modifiers.new("Solid", 'SOLIDIFY'); s.thickness = 0.004; s.offset = 0
bpy.ops.object.modifier_move_to_index(modifier="Solid", index=0); bpy.ops.object.modifier_apply(modifier="Solid")
for p in hb.data.polygons:
    p.flip() if False else None
bpy.context.view_layer.objects.active = hb
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')

# ---- brows: ray-projected arcs above each eye
bm = bmesh.new()
for sx in (1, -1):
    top, bot = [], []
    n = 9
    for k in range(n):
        t = k / (n - 1)                         # 0 = inner, 1 = outer
        x = sx * (0.012 + 0.034 * t)
        zc = EYE_Z + 0.0215 + 0.0045 * math.sin(math.pi * min(1, t * 1.25)) - 0.004 * t
        hgt = 0.0062 * (1 - 0.55 * t)
        for (zz, arr) in ((zc + hgt / 2, top), (zc - hgt / 2, bot)):
            o = Vector((x, -0.4, zz)); hit = bvh.ray_cast(o, Vector((0, 1, 0)), 0.5)
            arr.append(bm.verts.new(hit[0] + hit[1] * 0.0012))
    for k in range(n - 1):
        f = (bot[k], bot[k + 1], top[k + 1], top[k]) if sx > 0 else (bot[k], top[k], top[k + 1], bot[k + 1])
        bm.faces.new(f)
bm.normal_update()
bme = bpy.data.meshes.new("Kai_Brows"); bm.to_mesh(bme); bm.free()
br = bpy.data.objects.new("Kai_Brows", bme); coll.objects.link(br)
bme.materials.append(M["Kai_Brow"])
skinned_rigid(br)
print("BROWS_FACES", len(bme.polygons))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kai_03_outfit.blend"))
print("SAVED")
