"""Render keyframe strip + preview video of the serve (side, front-3/4, behind)."""
import bpy, os, sys, json, math
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
mode = args[0] if args else "keys"
tag = args[1] if len(args) > 1 else "v1"
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json"))); T = plan["T"]
rig = bpy.data.objects["Kai_Rig"]; rig.hide_render = True
sc = setup_render((640, 800) if mode == "keys" else (720, 900), samples=16)
add_lights(); ground(color=(0.17, 0.42, 0.62, 1))
# court lines: baseline + centre mark for spatial reference
def strip(name, a, b, w=0.05):
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    d = (b - a).normalized(); s = d.cross(Vector((0, 0, 1))).normalized() * w / 2
    vs = [bm.verts.new(p) for p in (a - s, b - s, b + s, a + s)]; bm.faces.new(vs); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    m = bpy.data.materials.new(name + "M"); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.95, 0.95, 0.95, 1)
    me.materials.append(m); o.location.z = 0.002
strip("Baseline", Vector((-4, -0.25, 0)), Vector((4, -0.25, 0)))
strip("Centre", Vector((0, -0.25, 0)), Vector((0, -0.45, 0)))
cams = {"side": ((6.2, -0.4, 1.45), (0, -0.25, 1.35)), "front34": ((3.6, -5.2, 1.7), (0, -0.25, 1.35)), "behind": ((-0.6, 6.0, 2.0), (0, -0.4, 1.4))}
if mode == "keys":
    keys = [("准备", T["start"]), ("抛球", T["release"]), ("奖杯位", T["trophy"]), ("拍头下坠", T["drop"]), ("击球", T["contact"]), ("随挥减速", T["decel"]), ("落地", T["land"]), ("收势", T["finish"])]
    for cname in ("side", "front34"):
        loc, tgt = cams[cname]; cam = camera("QA_Cam_" + cname, loc, tgt, lens=38)
        for label, f in keys:
            sc.frame_set(f)
            render(os.path.join(ROOT, "renders", "keys", f"{tag}_{cname}_{f:03d}.png"), cam)
    print("KEYS", [f for _, f in keys])
else:
    cname = args[2] if len(args) > 2 else "front34"
    loc, tgt = cams[cname]; cam = camera("QA_Cam_" + cname, loc, tgt, lens=38)
    sc.camera = cam
    outdir = os.path.join(ROOT, "renders", f"seq_{tag}_{cname}"); os.makedirs(outdir, exist_ok=True)
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f); sc.render.filepath = os.path.join(outdir, f"{f:04d}.png")
        bpy.ops.render.render(write_still=True)
    print("SEQ", outdir)
