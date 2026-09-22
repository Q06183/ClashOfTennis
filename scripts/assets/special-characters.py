"""Local uniform variants of existing owned rigs; no external generation."""
import bpy, pathlib, json, math
from mathutils import Vector
root=pathlib.Path(__file__).resolve().parents[2]
variants=[('noah','rafa',(0.045,.22,.34,1),(.72,.85,.84,1)),('adrian','leo',(.34,.16,.055,1),(.9,.76,.48,1)),('luca','mei',(.29,.12,.37,1),(.82,.7,.87,1))]
reports=[]
for name,source,color,accent in variants:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src=root/f'public/models/characters/{source}.glb'
    bpy.ops.import_scene.gltf(filepath=str(src))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    modified=0
    for o in meshes:
        original=list(o.data.materials)
        uniforms=[]
        for suffix,tint in [('panel',color),('stripe',accent)]:
            mat=bpy.data.materials.new(f'{name}-{suffix}');mat.diffuse_color=tint;mat.use_nodes=True
            bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=tint;bsdf.inputs['Roughness'].default_value=.8
            o.data.materials.append(mat);uniforms.append(len(o.data.materials)-1)
        for poly in o.data.polygons:
            coords=[o.matrix_world@o.data.vertices[i].co for i in poly.vertices]
            # Only the central fabric panel, never arms/neck/face/skin.
            if all(.99<v.z<1.45 and abs(v.x)<.235 for v in coords):
                poly.material_index=uniforms[int(abs(poly.center.x)<.028)];modified+=1
    if modified<20:raise RuntimeError(f'No fabric panel on {name}: {modified}')
    out=root/f'assets/characters/{name}';out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'athlete-rig.blend'))
    bpy.ops.export_scene.gltf(filepath=str(root/f'public/models/characters/{name}.glb'),export_format='GLB',export_animations=False,export_skins=True,export_yup=True,export_image_format='JPEG',export_jpeg_quality=90)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.render.resolution_x=256;scene.render.resolution_y=320;scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.world=bpy.data.worlds.new('portrait-world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.8,.9,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
    for loc,power,size in [((2,-3,5),420,4),((-3,-1,3),250,3)]:
        data=bpy.data.lights.new('softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
        light=bpy.data.objects.new('softbox',data);scene.collection.objects.link(light);light.location=loc;light.rotation_euler=(Vector((0,0,1.4))-light.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('portrait');cam=bpy.data.objects.new('portrait',data);scene.collection.objects.link(cam);scene.camera=cam
    cam.location=(1,-4,2.5);cam.rotation_euler=(Vector((0,0,1.4))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=1.5
    scene.render.filepath=str(root/f'public/portraits/{name}.png');bpy.ops.render.render(write_still=True)
    reports.append({'id':name,'derivedFrom':str(src.relative_to(root)),'model':f'public/models/characters/{name}.glb','editable':f'assets/characters/{name}/athlete-rig.blend','portrait':f'public/portraits/{name}.png','fabricFaces':modified,'changes':'Locally authored central uniform panel and accent stripe; source geometry, skin weights and original textures preserved','externalCredits':0})
(root/'assets/characters/special-provenance.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
