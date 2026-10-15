"""Shared helpers for Kai pipeline renders (Blender 5.2)."""
import bpy, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def engine_name():
    items = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    for k in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        if k in items:
            return k
    return "BLENDER_WORKBENCH"

def setup_render(res=(900, 1200), engine=None, transparent=False, samples=32):
    sc = bpy.context.scene
    sc.render.engine = engine or engine_name()
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = 'PNG'
    try:
        sc.eevee.taa_render_samples = samples
    except Exception:
        pass
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    w = sc.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.78, 0.84, 0.90, 1)
        bg.inputs[1].default_value = 0.55
    return sc

def add_lights():
    for o in [o for o in bpy.data.objects if o.name.startswith("QA_Light")]:
        bpy.data.objects.remove(o, do_unlink=True)
    def L(name, typ, loc, energy, rot=None, size=1.0, color=(1, 1, 1)):
        d = bpy.data.lights.new(name, typ); d.energy = energy; d.color = color
        if typ == 'AREA':
            d.size = size
        o = bpy.data.objects.new(name, d); bpy.context.scene.collection.objects.link(o)
        o.location = loc
        if rot:
            o.rotation_euler = rot
        else:
            look_at(o, Vector((0, 0, 1.1)))
        return o
    L("QA_Light_Key", 'AREA', (-2.5, -3.5, 4.0), 900, size=3, color=(1, 0.96, 0.9))
    L("QA_Light_Fill", 'AREA', (3.5, -2.0, 2.5), 350, size=4, color=(0.85, 0.92, 1))
    L("QA_Light_Rim", 'AREA', (0.5, 4.0, 3.5), 600, size=3)
    sun = bpy.data.lights.new("QA_Light_Sun", 'SUN'); sun.energy = 2.2; sun.angle = math.radians(8)
    so = bpy.data.objects.new("QA_Light_Sun", sun); bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(-35))

def look_at(obj, target):
    d = (Vector(target) - obj.location)
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def camera(name, loc, target, ortho=None, lens=50):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cd = bpy.data.cameras.new(name)
        cam = bpy.data.objects.new(name, cd); bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    look_at(cam, target)
    if ortho:
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'; cam.data.lens = lens
    cam.data.clip_end = 200
    return cam

def ground(size=30, color=(0.30, 0.52, 0.36, 1), name="QA_Ground"):
    g = bpy.data.objects.get(name)
    if g is None:
        bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
        g = bpy.context.active_object; g.name = name
        m = bpy.data.materials.new(name + "_M")
        m.use_nodes = True
        p = m.node_tree.nodes.get("Principled BSDF")
        p.inputs["Base Color"].default_value = color
        p.inputs["Roughness"].default_value = 0.9
        g.data.materials.append(m)
    return g

def render(path, cam):
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
