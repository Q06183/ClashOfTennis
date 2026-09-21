import bpy,sys,math,json,pathlib
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]; source=pathlib.Path(args[0]); output=pathlib.Path(args[1]);output.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render];points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);center=(lo+hi)/2;size=hi-lo
stats={'source':str(source),'bounds':{'min':list(lo),'max':list(hi),'size':list(size)},'objects':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'materials':[m.name if m else None for m in o.data.materials],'vertexGroups':[g.name for g in o.vertex_groups]} for o in meshes],'armatures':[{'name':o.name,'bones':[b.name for b in o.data.bones]} for o in bpy.context.scene.objects if o.type=='ARMATURE'],'images':[{'name':im.name,'size':list(im.size)} for im in bpy.data.images]}
(output/'source-inspection.json').write_text(json.dumps(stats,indent=2))
# Render original from four views without altering the delivered source.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=20;scene.render.resolution_x=600;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
def point_at(obj,p):obj.rotation_euler=(p-obj.location).to_track_quat('-Z','Y').to_euler()
height=max(size);unit=height/2
for name,offset,energy in [('Key',Vector((3,-4,6)),1200),('Fill',Vector((-3,-1,3)),650),('Rim',Vector((1,4,5)),1400)]:
    bpy.ops.object.light_add(type='AREA',location=center+offset*unit);light=bpy.context.object;light.name=name;light.data.energy=energy*unit*unit;light.data.shape='DISK';light.data.size=4*unit;point_at(light,center)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=height*1.18
for name,offset in [('front',(0,-4,.15)),('back',(0,4,.15)),('side',(4,0,.15)),('three-quarter',(3,-4,.6))]:
    cam.location=center+Vector(offset)*unit;point_at(cam,center);scene.render.filepath=str(output/(name+'.png'));bpy.ops.render.render(write_still=True)
print(json.dumps(stats))
