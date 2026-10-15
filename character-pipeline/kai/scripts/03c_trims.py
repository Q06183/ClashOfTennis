"""Step 4c: clean trim colouring that follows edge loops (collar, cuffs, hem, waistband, leg hems)."""
import bpy, bmesh, os
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "kai_03_outfit.blend"))

def ring_dist(bm):
    """ring distance of each vertex from its nearest open boundary, and which boundary loop."""
    bnd = [v for v in bm.verts if v.is_boundary]
    # group boundary verts into loops
    loops, seen = [], set()
    for v in bnd:
        if v in seen: continue
        stack, comp = [v], []
        seen.add(v)
        while stack:
            a = stack.pop(); comp.append(a)
            for e in a.link_edges:
                if e.is_boundary:
                    b = e.other_vert(a)
                    if b not in seen: seen.add(b); stack.append(b)
        loops.append(comp)
    dist, owner = {}, {}
    frontier = []
    for li, comp in enumerate(loops):
        for v in comp:
            dist[v] = 0; owner[v] = li; frontier.append(v)
    while frontier:
        nxt = []
        for v in frontier:
            for e in v.link_edges:
                o = e.other_vert(v)
                if o not in dist:
                    dist[o] = dist[v] + 1; owner[o] = owner[v]; nxt.append(o)
        frontier = nxt
    return loops, dist, owner

def recolor(name, rule):
    o = bpy.data.objects[name]
    bm = bmesh.new(); bm.from_mesh(o.data)
    loops, dist, owner = ring_dist(bm)
    info = []
    for comp in loops:
        cz = sum(v.co.z for v in comp) / len(comp); cx = sum(v.co.x for v in comp) / len(comp)
        info.append((cz, cx, len(comp)))
    print(name, "LOOPS", [(round(z, 3), round(x, 3), n) for z, x, n in info])
    for f in bm.faces:
        ds = [dist.get(v, 99) for v in f.verts]
        own = owner.get(min(f.verts, key=lambda v: dist.get(v, 99)))
        f.material_index = rule(min(ds), info[own] if own is not None else None)
    bm.to_mesh(o.data); bm.free()

# Shirt slots: 0 white, 1 coral, 2 navy.  Solidified shell -> inner/outer share the same open loops.
def shirt_rule(d, inf):
    if inf is None: return 0
    z, x, n = inf
    if z > 1.5 and abs(x) < 0.1:       # collar
        return 1 if d <= 2 else 0
    if abs(x) > 0.15:                  # sleeve cuffs
        return 1 if d <= 1 else 0
    return 2 if d <= 1 else 0         # hem band
recolor("Kai_Shirt", shirt_rule)

# Shorts slots: 0 navy, 1 coral, 2 navy
def shorts_rule(d, inf):
    if inf is None: return 0
    z, x, n = inf
    if z > 0.95:                       # waistband
        return 1 if d == 1 else 0
    return 1 if d <= 1 else 0         # leg hem
recolor("Kai_Shorts", shorts_rule)

def sock_rule(d, inf):
    if inf is None: return 0
    z, x, n = inf
    return 1 if (z > 0.12 and d <= 1) else 0
recolor("Kai_Socks", sock_rule)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kai_03_outfit.blend"))
print("SAVED")
