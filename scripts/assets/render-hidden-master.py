"""Save editable Wuming source and render its portrait from the shipped GLB."""
import hashlib
import json
import pathlib
import bpy
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/characters/wuming"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / "public/models/characters/wuming.glb"))
for image in bpy.data.images:
    if image.source != 'VIEWER':
        image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "athlete-refined.blend"))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = 256
scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
world = bpy.data.worlds.new('Studio')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.72, .8, .9, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .6
for position, power, size in [((2, -3, 5), 420, 4), ((-3, -1, 3), 250, 3)]:
    data = bpy.data.lights.new('Softbox', 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new('Softbox', data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector((0, 0, 1.4))-obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Portrait')
cam = bpy.data.objects.new('Portrait', data)
scene.collection.objects.link(cam)
cam.location = (1, -4, 2.5)
cam.rotation_euler = (Vector((0, 0, 1.4))-cam.location).to_track_quat('-Z', 'Y').to_euler()
data.type = 'ORTHO'
data.ortho_scale = 1.5
scene.camera = cam
scene.render.image_settings.file_format = 'PNG'
portrait = ROOT / 'public/portraits/wuming.png'
scene.render.filepath = str(portrait)
bpy.ops.render.render(write_still=True)
report_path = OUT / "provenance.json"
report = json.loads(report_path.read_text())
report.update({
    "portrait": str(portrait.relative_to(ROOT)),
    "portraitSha256": hashlib.sha256(portrait.read_bytes()).hexdigest(),
    "editable": str((OUT / "athlete-refined.blend").relative_to(ROOT)),
    "editableSha256": hashlib.sha256((OUT / "athlete-refined.blend").read_bytes()).hexdigest(),
})
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
