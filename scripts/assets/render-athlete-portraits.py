"""Render roster portraits from the shipped, refined GLBs without external assets."""
import bpy,pathlib
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
for name in ['lin','mei','rafa','sora','ines','leo','noah','adrian','luca']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 path=ROOT/('public/models/athlete.glb' if name=='lin' else f'public/models/characters/{name}.glb')
 bpy.ops.import_scene.gltf(filepath=str(path))
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
 scene.render.resolution_x=256;scene.render.resolution_y=320;scene.render.resolution_percentage=100
 scene.render.film_transparent=True
 world=bpy.data.worlds.new('Studio');scene.world=world;world.use_nodes=True
 world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.8,.9,1)
 world.node_tree.nodes['Background'].inputs[1].default_value=.6
 for position,power,size in [((2,-3,5),420,4),((-3,-1,3),250,3)]:
  data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
  obj=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(obj);obj.location=position
  obj.rotation_euler=(Vector((0,0,1.4))-obj.location).to_track_quat('-Z','Y').to_euler()
 data=bpy.data.cameras.new('Portrait');cam=bpy.data.objects.new('Portrait',data);scene.collection.objects.link(cam)
 cam.location=(1,-4,2.5);cam.rotation_euler=(Vector((0,0,1.4))-cam.location).to_track_quat('-Z','Y').to_euler()
 data.type='ORTHO';data.ortho_scale=1.5;scene.camera=cam
 scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/f'public/portraits/{name}.png')
 bpy.ops.render.render(write_still=True)
