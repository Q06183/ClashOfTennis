"""Blender editable sources + matching prototype portraits, originals untouched."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
for name in ['lin', 'mei', 'noah']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/f'public/models/prototypes/{name}.glb'))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    # Revision 3 retains continuous skin with calibrated source proportions.
    # Never re-add the rejected separate forearm, elbow cap or finger props.
    for im in bpy.data.images:
        if im.source != 'VIEWER':
            im.pack()
    rig['source_note'] = 'Revision 3: continuous textured skin, aligned arm centreline, calibrated hand and leg proportions. Runtime IK remains TypeScript.'
    folder = ROOT/f'assets/characters/{name}'
    folder.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'athlete-hand-face-prototype.blend'))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.render.resolution_x = 256
    scene.render.resolution_y = 320
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    world = bpy.data.worlds.new('Studio')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.75, .80, .86, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .65
    for pos, power in [((2, -3, 5), 350), ((-3, -1, 3), 250)]:
        light = bpy.data.lights.new('Softbox', 'AREA')
        light.energy = power
        light.size = 4
        obj = bpy.data.objects.new('Softbox', light)
        scene.collection.objects.link(obj)
        obj.location = pos
        obj.rotation_euler = (Vector((0, 0, 1.4))-obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.cameras.new('Portrait')
    obj = bpy.data.objects.new('Portrait', camera)
    scene.collection.objects.link(obj)
    obj.location = (.45, -4, 2.05)
    obj.rotation_euler = (Vector((0, 0, 1.48))-obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera.type = 'ORTHO'
    camera.ortho_scale = 1.30
    scene.camera = obj
    dest = ROOT/'public/portraits/prototypes'
    dest.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(dest/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('PROTOTYPE_SAVED', name)
