"""Step 4: outfit (skin-following garments that share body weights), hair, eyes, brows,
racket and ball for Kai. Garments are generated from the body surface and inherit its
skin weights, so they deform with the body and cannot drift away from it."""
import bpy, bmesh, os, math
from mathutils import Vector

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "kai_02_rigged_raw.blend"))
rig = bpy.data.objects["Kai_Rig"]
body = bpy.data.objects["Kai_Body"]
coll = body.users_collection[0]

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple([x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]) + (1.0,)

def mat(name, hexcol, rough=0.6, sss=0.0, sheen=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = srgb(hexcol)
    p.inputs["Roughness"].default_value = rough
    if sss:
        try:
            p.inputs["Subsurface Weight"].default_value = sss
            p.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
            p.inputs["Subsurface Scale"].default_value = 0.004
        except Exception as e:
            print("SSS-SKIP", e)
    if sheen:
        try:
            p.inputs["Sheen Weight"].default_value = sheen
        except Exception:
            pass
    m.diffuse_color = srgb(hexcol)
    return m

M = {
    "skin": mat("Kai_Skin", "#C98E6B", 0.55, sss=0.12),
    "lip": mat("Kai_Lip", "#A8624F", 0.45, sss=0.1),
    "brow": mat("Kai_Brow", "#2A1C14", 0.8),
    "hair": mat("Kai_Hair", "#2B1D15", 0.55, sheen=0.3),
    "shirt": mat("Kai_Shirt_White", "#F2F0E8", 0.75, sheen=0.2),
    "coral": mat("Kai_Coral", "#FF6A3D", 0.6, sheen=0.2),
    "navy": mat("Kai_Navy", "#1B2A4A", 0.7, sheen=0.2),
    "sock": mat("Kai_Sock", "#FAFAF7", 0.85, sheen=0.3),
    "shoe": mat("Kai_Shoe_White", "#F7F7F4", 0.45),
    "sole": mat("Kai_Sole", "#2A3550", 0.6),
    "sclera": mat("Kai_Sclera", "#F4F1EC", 0.25),
    "iris": mat("Kai_Iris", "#5A3A22", 0.3),
    "pupil": mat("Kai_Pupil", "#0B0807", 0.2),
}

def activate(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o

# ---- 0. bake MPFB shape keys into the rest shape
activate(body)
bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
mw = body.matrix_world.copy()
print("BODY_MW_IDENTITY", mw == mw.Identity(4) if hasattr(mw, 'Identity') else mw)

vg_name = {g.index: g.name for g in body.vertex_groups}
def members(name):
    gi = body.vertex_groups[name].index
    return {v.index for v in body.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}

# ---- 1. eyes from helper spheres
eyes = []
for side in ("l", "r"):
    ids = members(f"helper-{side}-eye")
    pts = [mw @ body.data.vertices[i].co for i in ids]
    c = sum(pts, Vector()) / len(pts)
    r = sum((p - c).length for p in pts) / len(pts)
    eyes.append((side, c, r))
    print("EYE", side, tuple(round(x, 4) for x in c), round(r, 4))

def skinned_rigid(obj, bone):
    obj.parent = rig
    obj.vertex_groups.clear()
    g = obj.vertex_groups.new(name=bone)
    g.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    md = obj.modifiers.new("Armature", 'ARMATURE'); md.object = rig

for side, c, r in eyes:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r * 0.97)
    # pole along -Y (forward)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.radians(90), 3, 'X'))
    me = bpy.data.meshes.new(f"Kai_Eye_{side}")
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f"Kai_Eye_{side.upper()}", me); coll.objects.link(o)
    for m in (M["sclera"], M["iris"], M["pupil"]):
        me.materials.append(m)
    for p in me.polygons:
        d = p.center.normalized()
        a = math.degrees(math.acos(max(-1, min(1, -d.y))))  # angle from forward axis
        p.material_index = 2 if a < 11 else (1 if a < 27 else 0)
        p.use_smooth = True
    for v in me.vertices:
        v.co += c
    skinned_rigid(o, "head")

# ---- 2. hair from the MakeHuman hair helper cap
hair_ids = members("helper-hair")
hair = body.copy(); hair.data = body.data.copy(); hair.name = "Kai_Hair"; hair.data.name = "Kai_Hair"
coll.objects.link(hair)
for md in list(hair.modifiers):
    hair.modifiers.remove(md)
bm = bmesh.new(); bm.from_mesh(hair.data)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in hair_ids], context='VERTS')
bm.normal_update()
zs = [v.co.z for v in bm.verts]; zmin, zmax = min(zs), max(zs)
head_c = Vector((0, sum(v.co.y for v in bm.verts) / len(bm.verts), (zmin + zmax) / 2))
for v in bm.verts:
    k = max(0.0, (v.co.z - zmin) / (zmax - zmin))
    front = max(0.0, -(v.co.y - head_c.y) / 0.1)
    off = 0.003 + 0.012 * k ** 1.5 + 0.004 * front * k   # volume on crown, slight quiff
    v.co += v.normal * off
bm.to_mesh(hair.data); bm.free()
hair.data.materials.clear(); hair.data.materials.append(M["hair"])
for p in hair.data.polygons:
    p.use_smooth = True
print("HAIR_VERTS", len(hair.data.vertices), "Z", round(zmin, 3), round(zmax, 3))
skinned_rigid(hair, "head")
activate(hair)
s = hair.modifiers.new("Solid", 'SOLIDIFY'); s.thickness = 0.005; s.offset = -1
bpy.ops.object.modifier_move_to_index(modifier="Solid", index=0)
bpy.ops.object.modifier_apply(modifier="Solid")
sd = hair.modifiers.new("Sub", 'SUBSURF'); sd.levels = 1; sd.render_levels = 1
bpy.ops.object.modifier_move_to_index(modifier="Sub", index=0)
bpy.ops.object.modifier_apply(modifier="Sub")

# ---- 3. clean body: drop helper geometry, keep only the 'body' group
body_ids = members("body")
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in body_ids], context='VERTS')
bm.to_mesh(body.data); bm.free()
for md in list(body.modifiers):
    if md.type == 'MASK':
        body.modifiers.remove(md)
for g in list(body.vertex_groups):
    if g.name.startswith(("helper", "joint")) or g.name in ("HelperGeometry", "JointCubes"):
        body.vertex_groups.remove(g)
me = body.data
vg_name = {g.index: g.name for g in body.vertex_groups}
W = [{vg_name[g.group]: g.weight for g in v.groups if g.group in vg_name} for v in me.vertices]
P = [mw @ v.co for v in me.vertices]
N = [(mw.to_3x3() @ v.normal).normalized() for v in me.vertices]
nbr = [[] for _ in me.vertices]
for e in me.edges:
    a, b = e.vertices; nbr[a].append(b); nbr[b].append(a)
print("BODY_CLEAN_VERTS", len(me.vertices), "POLYS", len(me.polygons))

B = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}
def t_along(p, bone):
    h, t = B[bone]; d = t - h
    return (p - h).dot(d) / d.length_squared
FINGERS = ("thumb", "index", "middle", "ring", "pinky")
def armw(i, s):
    return sum(w for n, w in W[i].items() if n.endswith("_" + s) and n.startswith(("upperarm", "lowerarm", "hand") + FINGERS))
def legw(i, s):
    return sum(w for n, w in W[i].items() if n.endswith("_" + s) and n.startswith(("thigh", "calf", "foot", "ball")))
neck_h = B["neck_01"][0]
print("NECK_HEAD", tuple(round(x, 3) for x in neck_h), "PELVIS", tuple(round(x, 3) for x in B["pelvis"][0]))

HEM_Z, WAIST_Z = 0.935, 1.06
def collar_z(y):
    f = max(-1.0, min(1.0, (y - neck_h.y) / 0.08))   # -1 front, +1 back
    return neck_h.z - 0.040 + 0.030 * f

shirt, shorts, socks, shoes, wb_r, wb_l = set(), set(), set(), set(), set(), set()
for i, p in enumerate(P):
    al, ar, ll, lr = armw(i, "l"), armw(i, "r"), legw(i, "l"), legw(i, "r")
    headw = W[i].get("head", 0)
    if max(al, ar) > 0.5:
        s = "l" if al > ar else "r"
        if t_along(p, "upperarm_" + s) < 0.48:
            shirt.add(i)
        tf = t_along(p, "lowerarm_" + s)
        if 0.80 <= tf <= 0.93:
            (wb_r if s == "r" else wb_l).add(i)
        continue
    lw = max(ll, lr)
    # shirt torso: everything between a flat hem height and the collar (hips included, so the hem is a clean ring)
    if headw < 0.2 and HEM_Z <= p.z <= collar_z(p.y) and (lw <= 0.5 or p.z >= HEM_Z):
        if max(al, ar) <= 0.5:
            shirt.add(i)
    if p.z <= WAIST_Z:
        if lw > 0.5:
            s = "l" if ll > lr else "r"
            if t_along(p, "thigh_" + s) < 0.45:
                shorts.add(i)
        elif p.z > 0.5:
            shorts.add(i)
    if lw > 0.5 and p.z <= 0.095:
        shoes.add(i)
    if lw > 0.5 and 0.07 <= p.z <= 0.19:
        socks.add(i)
print("REGIONS shirt", len(shirt), "shorts", len(shorts), "socks", len(socks), "shoes", len(shoes), "wb", len(wb_r), len(wb_l))

def erode(R, n):
    for _ in range(n):
        R = {i for i in R if all(j in R for j in nbr[i])}
    return R

def planar_cut(bm, z, keep_above=True):
    """Bisect the open garment shell with a horizontal plane and drop the other side -> perfectly level hem."""
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1),
                           clear_outer=not keep_above, clear_inner=keep_above, dist=1e-5)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')

def smooth_boundaries(bm, iters=12, skip_z=None):
    """Relax every open boundary loop along itself so stair-stepped selection edges become clean curves,
    then pull the vertices back onto the offset body surface (only tangential motion)."""
    bnd = [v for v in bm.verts if v.is_boundary and not (skip_z is not None and abs(v.co.z - skip_z) < 1e-4)]
    for _ in range(iters):
        new = {}
        for v in bnd:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new[v] = v.co * 0.5 + (nb[0].co + nb[1].co) * 0.25
        for v, c in new.items():
            v.co = c
    # second ring follows halfway to avoid thin slivers
    ring2 = {e.other_vert(v) for v in bnd for e in v.link_edges if not e.other_vert(v).is_boundary}
    for v in ring2:
        nb = [e.other_vert(v).co for e in v.link_edges]
        v.co = v.co * 0.6 + sum(nb, Vector()) / len(nb) * 0.4

def add_piping(o, bm, loops_filter, width, mat_index, out=0.0015):
    """Extrude a clean trim band inward from selected open boundary loops (like ribbed collars/cuffs).
    The band is a separate strip of quads built from the smoothed boundary loop, so its edge is a clean curve."""
    made = 0
    bnd_edges = [e for e in bm.edges if e.is_boundary]
    loops, seen = [], set()
    for e0 in bnd_edges:
        if e0 in seen: continue
        # walk the loop
        loop = [e0.verts[0]]; seen.add(e0); cur, prev = e0.verts[1], e0.verts[0]
        while cur is not loop[0]:
            loop.append(cur)
            nxt = [e for e in cur.link_edges if e.is_boundary and e not in seen]
            if not nxt: break
            seen.add(nxt[0]); prev, cur = cur, nxt[0].other_vert(cur)
        loops.append(loop)
    for loop in loops:
        if len(loop) < 6: continue
        cz = sum(v.co.z for v in loop) / len(loop); cx = sum(v.co.x for v in loop) / len(loop)
        if not loops_filter(cz, cx): continue
        n = len(loop)
        # inward direction = average toward neighbouring interior verts
        inner = []
        for i, v in enumerate(loop):
            t = (loop[(i + 1) % n].co - loop[i - 1].co).normalized()
            nrm = v.normal if v.normal.length > 0 else Vector((0, 0, 1))
            d = nrm.cross(t).normalized()
            interior = [e.other_vert(v).co for e in v.link_edges if not e.is_boundary]
            if interior and (sum(interior, Vector()) / len(interior) - v.co).dot(d) < 0:
                d = -d
            inner.append((v.co + nrm * out, v.co + d * width + nrm * out))
        A = [bm.verts.new(p) for p, q in inner]; Bv = [bm.verts.new(q) for p, q in inner]
        for i in range(n):
            f = bm.faces.new((A[i], A[(i + 1) % n], Bv[(i + 1) % n], Bv[i]))
            f.material_index = mat_index; f.smooth = True
        made += 1
    return made

def make_garment(name, region, offset_fn, mats, face_mat_fn, solid=0.002, post=None, smooth_edges=True,
                 piping=(), prune=True, cut_z=None):
    o = body.copy(); o.data = body.data.copy(); o.name = name; o.data.name = name
    coll.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in region for v in f.verts)], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # drop dangling faces with 2+ boundary edges on a single face (spikes on stair edges)
    for _ in range(3 if prune else 0):
        bad = [f for f in bm.faces if sum(1 for e in f.edges if e.is_boundary) >= 3]
        if not bad: break
        bmesh.ops.delete(bm, geom=bad, context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset_fn(v.co)
    if smooth_edges:
        smooth_boundaries(bm, skip_z=cut_z)
    if cut_z is not None:
        planar_cut(bm, cut_z, keep_above=True)
    if post:
        post(bm)
    bm.normal_update()
    o.data.materials.clear()
    for m in mats:
        o.data.materials.append(m)
    # ring distance from each open boundary loop (computed before solidify closes the edges)
    bnd = [v for v in bm.verts if v.is_boundary]
    loops, seen = [], set()
    for v in bnd:
        if v in seen: continue
        stack, comp = [v], []; seen.add(v)
        while stack:
            a = stack.pop(); comp.append(a)
            for e in a.link_edges:
                if e.is_boundary:
                    b2 = e.other_vert(a)
                    if b2 not in seen: seen.add(b2); stack.append(b2)
        loops.append(comp)
    dist, owner, frontier = {}, {}, []
    for li, comp in enumerate(loops):
        for v in comp: dist[v] = 0; owner[v] = li; frontier.append(v)
    while frontier:
        nxt = []
        for v in frontier:
            for e in v.link_edges:
                ov = e.other_vert(v)
                if ov not in dist: dist[ov] = dist[v] + 1; owner[ov] = owner[v]; nxt.append(ov)
        frontier = nxt
    linfo = [(sum(v.co.z for v in c) / len(c), sum(v.co.x for v in c) / len(c), len(c)) for c in loops]
    for f in bm.faces:
        vmin = min(f.verts, key=lambda v: dist.get(v, 99))
        d = dist.get(vmin, 99); inf = linfo[owner[vmin]] if vmin in owner else None
        try:
            f.material_index = face_mat_fn(f.calc_center_median(), f.normal, d, inf)
        except TypeError:
            f.material_index = face_mat_fn(f.calc_center_median(), f.normal)
        f.smooth = True
    bm.normal_update()
    for flt, width, mi in piping:
        add_piping(o, bm, flt, width, mi)
    bm.to_mesh(o.data); bm.free()
    if solid:
        activate(o)
        s = o.modifiers.new("Solid", 'SOLIDIFY'); s.thickness = solid; s.offset = -1; s.use_rim = True
        s.material_offset_rim = 0
        bpy.ops.object.modifier_move_to_index(modifier="Solid", index=0)
        bpy.ops.object.modifier_apply(modifier="Solid")
    print("GARMENT", name, "verts", len(o.data.vertices), "faces", len(o.data.polygons))
    return o

def side_of(c):
    return "l" if c.x > 0 else "r"

# Shirt: white body; trims are clean piping bands built from smoothed edge loops
make_garment("Kai_Shirt", shirt, lambda p: 0.016 + 0.010 * max(0.0, min(1.0, (WAIST_Z + 0.06 - p.z) / 0.08)), [M["shirt"], M["coral"], M["navy"]],
             lambda c, n, d, inf: 0, solid=0.0025,
             piping=[(lambda z, x: z > 1.45 and abs(x) < 0.1, 0.018, 1),   # collar
                     (lambda z, x: abs(x) > 0.15, 0.012, 1),               # sleeve cuffs
                     (lambda z, x: z < 1.1 and abs(x) < 0.1, 0.022, 2)],   # hem band
             cut_z=HEM_Z + 0.03)

make_garment("Kai_Shorts", shorts, lambda p: 0.008, [M["navy"], M["coral"]],
             lambda c, n, d, inf: 0, solid=0.0025,
             piping=[(lambda z, x: z < 0.95, 0.012, 1)])                   # leg hems

make_garment("Kai_Socks", socks, lambda p: 0.0025, [M["sock"], M["coral"]],
             lambda c, n, d, inf: 0, solid=0.0,
             piping=[(lambda z, x: z > 0.12, 0.010, 1)])

def flatten_sole(bm):
    for v in bm.verts:
        if v.co.z < 0.0:
            v.co.z = 0.0
make_garment("Kai_Shoes", shoes, lambda p: 0.010 if p.z > 0.01 else 0.006,
             [M["shoe"], M["sole"], M["coral"]],
             lambda c, n: 1 if c.z < 0.012 else (2 if c.z < 0.024 else 0), solid=0.003, post=flatten_sole)

make_garment("Kai_Wristband_R", wb_r, lambda p: 0.006, [M["coral"]], lambda c, n: 0, solid=0.002, prune=False, smooth_edges=False)
make_garment("Kai_Wristband_L", wb_l, lambda p: 0.006, [M["shirt"]], lambda c, n: 0, solid=0.002, prune=False, smooth_edges=False)

# ---- 4. remove skin that is fully hidden under garments (prevents poke-through)
hidden = erode(shirt | shorts, 2) | erode(shoes, 1) | erode(socks - shoes, 1) | erode(wb_r, 1) | erode(wb_l, 1)
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.index in hidden for v in f.verts)], context='FACES_ONLY')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(me); bm.free()

# ---- 5. skin + lips + brows (brows conform to the brow ridge)
me.materials.clear(); me.materials.append(M["skin"]); me.materials.append(M["lip"])
mouth = members_mouth = None
for p in me.polygons:
    p.use_smooth = True
P = [mw @ v.co for v in me.vertices]
vg_name = {g.index: g.name for g in body.vertex_groups}
W = [{vg_name[g.group]: g.weight for g in v.groups if g.group in vg_name} for v in me.vertices]
brow = set()
for i, p in enumerate(P):
    if W[i].get("head", 0) < 0.6:
        continue
    for side, c, r in eyes:
        dx = (p.x - c.x) * (1 if side == "l" else -1)   # + = outward
        dz = p.z - c.z
        if -0.019 <= dx <= 0.024 and p.y < c.y - 0.004:
            lo = 0.0165 + 0.004 * max(0, dx) / 0.024
            if lo <= dz <= lo + 0.0075 - 0.003 * max(0, dx) / 0.024:
                brow.add(i)
nb = [[] for _ in me.vertices]
for e in me.edges:
    a, b = e.vertices; nb[a].append(b); nb[b].append(a)
make_garment("Kai_Brows", brow, lambda p: 0.0012, [M["brow"]], lambda c, n: 0, solid=0.0)

# ---- 6. racket (ITF-legal dimensions) and ball; local frame: +Y butt->tip, +Z face normal
def build_racket():
    bm = bmesh.new()
    L, yc, a, b = 0.685, 0.5175, 0.121, 0.161
    beam_w, beam_t = 0.013, 0.023
    seg = 72
    ring = []
    for k in range(seg):
        th = 2 * math.pi * k / seg
        c = Vector((a * math.sin(th), yc - b * math.cos(th), 0))
        nrm = Vector((math.sin(th) / a, math.cos(th) / b * -1 * -1, 0))
        nrm = Vector((math.sin(th) * b, -math.cos(th) * a, 0)).normalized()
        quad = []
        for (u, w) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            quad.append(bm.verts.new(c + nrm * (u * beam_w / 2) + Vector((0, 0, w * beam_t / 2))))
        ring.append(quad)
    for k in range(seg):
        q0, q1 = ring[k], ring[(k + 1) % seg]
        for j in range(4):
            bm.faces.new((q0[j], q0[(j + 1) % 4], q1[(j + 1) % 4], q1[j]))
    def box(p0, p1, w0, w1, t0, t1, sides=8):
        d = (p1 - p0).normalized(); side = Vector((0, 0, 1)).cross(d).normalized(); up = Vector((0, 0, 1))
        r0, r1 = [], []
        for k in range(sides):
            ang = 2 * math.pi * (k + 0.5) / sides
            r0.append(bm.verts.new(p0 + side * math.cos(ang) * w0 / 2 + up * math.sin(ang) * t0 / 2))
            r1.append(bm.verts.new(p1 + side * math.cos(ang) * w1 / 2 + up * math.sin(ang) * t1 / 2))
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
        bm.faces.new(list(reversed(r0))); bm.faces.new(r1)
    th = math.radians(40)
    for sgn in (-1, 1):
        pj = Vector((sgn * a * math.sin(th), yc - b * math.cos(th), 0))
        box(Vector((sgn * 0.009, 0.255, 0)), pj, 0.014, 0.013, 0.021, 0.023)
    box(Vector((0, 0.005, 0)), Vector((0, 0.19, 0)), 0.034, 0.033, 0.030, 0.029)   # grip (wrapped)
    box(Vector((0, 0.0, 0)), Vector((0, 0.012, 0)), 0.038, 0.037, 0.034, 0.033)    # butt cap
    box(Vector((0, 0.19, 0)), Vector((0, 0.262, 0)), 0.028, 0.022, 0.024, 0.021)   # shaft/throat
    me = bpy.data.meshes.new("Kai_Racket"); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("Kai_Racket", me); coll.objects.link(o)
    me.materials.append(M["navy"]); me.materials.append(M["coral"]); me.materials.append(M["shirt"])
    for p in me.polygons:
        c = p.center
        p.material_index = 2 if c.y < 0.195 else (1 if (c.y > 0.60 and abs(c.x) > 0.085) or (0.26 < c.y < 0.40) else 0)
    # string bed with procedural alpha-masked texture
    img = bpy.data.images.new("Kai_Strings", 256, 256, alpha=True)
    px = [0.0] * (256 * 256 * 4)
    for y in range(256):
        for x in range(256):
            on = (x % 16) < 2 or (y % 13) < 2
            i4 = (y * 256 + x) * 4
            px[i4:i4 + 4] = [0.95, 0.95, 0.9, 1.0] if on else [0, 0, 0, 0.0]
    img.pixels = px; img.pack()
    sm = bpy.data.materials.new("Kai_StringBed"); sm.use_nodes = True
    nt = sm.node_tree; pr = nt.nodes.get("Principled BSDF")
    tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = img; tx.interpolation = 'Closest'
    nt.links.new(tx.outputs["Color"], pr.inputs["Base Color"]); nt.links.new(tx.outputs["Alpha"], pr.inputs["Alpha"])
    try:
        sm.surface_render_method = 'DITHERED'
    except Exception:
        sm.blend_method = 'CLIP'
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
    ai, bi = a - beam_w / 2, b - beam_w / 2
    vs = [bm.verts.new((ai * math.sin(2 * math.pi * k / 48), yc - bi * math.cos(2 * math.pi * k / 48), 0)) for k in range(48)]
    f = bm.faces.new(vs)
    for lp in f.loops:
        co = lp.vert.co; lp[uv].uv = ((co.x + ai) / (2 * ai), (co.y - (yc - bi)) / (2 * bi))
    bmesh.ops.triangulate(bm, faces=[f])
    sme = bpy.data.meshes.new("Kai_StringBed"); bm.to_mesh(sme); bm.free()
    so = bpy.data.objects.new("Kai_StringBed", sme); coll.objects.link(so); sme.materials.append(sm)
    so.parent = o
    return o

racket = build_racket()
for p in racket.data.polygons:
    p.use_smooth = False
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.0335)
bme = bpy.data.meshes.new("Kai_Ball"); bm.to_mesh(bme); bm.free()
ball = bpy.data.objects.new("Kai_Ball", bme); coll.objects.link(ball)
bme.materials.append(mat("Kai_BallFelt", "#D9F03A", 0.95, sheen=0.6))
for p in bme.polygons:
    p.use_smooth = True
ball.location = (0.6, -0.4, 0.0335)
racket.location = (1.0, 0, 0)
print("RACKET_DIMS", tuple(round(x, 3) for x in racket.dimensions))
total = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith("Kai_"))
print("TOTAL_FACES", total)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kai_03_outfit.blend"))
print("SAVED")
