import bpy,sys,pathlib,math,json
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];source=pathlib.Path(args[0]).resolve();output=pathlib.Path(args[1]).resolve();output.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Bake source transforms and normalize to the existing 1.96 m game character.
for o in meshes:
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.select_set(False)
points=[v.co for o in meshes for v in o.data.vertices];lo=min(v.z for v in points);hi=max(v.z for v in points);scale=1.96/(hi-lo)
for o in meshes:
    for v in o.data.vertices:v.co=Vector((v.co.x*scale,v.co.y*scale,(v.co.z-lo)*scale))
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.00005);bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT');o.data.validate(clean_customdata=True);o.data.update();o.select_set(False)
# Blender Z up / front -Y; exported glTF is Y up / front +Z.
arm=bpy.data.armatures.new('AthleteSkeleton');rig=bpy.data.objects.new('AthleteRig',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
segments={
 'Hips':((0,0,.85),(0,0,1.02),None),
 'Spine':((0,0,1.02),(0,0,1.40),'Hips'),
 'Neck':((0,0,1.40),(0,0,1.62),'Spine'),
 'Head':((0,0,1.62),(0,0,1.94),'Neck'),
}
for suffix,sign in [('R',-1),('L',1)]:
    segments.update({
     'UpperArm_'+suffix:((sign*.28,0,1.40),(sign*.44,0,1.11),'Spine'),
     'LowerArm_'+suffix:((sign*.44,0,1.11),(sign*.55,-.025,.91),'UpperArm_'+suffix),
     'Hand_'+suffix:((sign*.55,-.025,.91),(sign*.59,-.025,.80),'LowerArm_'+suffix),
     'UpperLeg_'+suffix:((sign*.145,0,.85),(sign*.17,0,.48),'Hips'),
     'LowerLeg_'+suffix:((sign*.17,0,.48),(sign*.18,0,.11),'UpperLeg_'+suffix),
     'Foot_'+suffix:((sign*.18,0,.11),(sign*.18,-.17,.06),'LowerLeg_'+suffix),
    })
for name,(head,tail,parent) in segments.items():
    b=arm.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.selected_objects:o.select_set(False)
for o in meshes:o.select_set(True)
rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# Restrict weights to anatomical regions, then use nearby bone segments.
# Low A-pose hands must not influence torso or shorts.
for o in meshes:
    for v in o.data.vertices:
        x,y,z=v.co;suffix='L' if x>0 else 'R';ax=abs(x)
        if ax>.35 and z>.55 and z<1.5:
            allowed={n+'_'+suffix for n in ['UpperArm','LowerArm','Hand']}
        elif z<.91:
            allowed={'Hips','Spine'}|{n+'_'+suffix for n in ['UpperLeg','LowerLeg','Foot']}
        elif ax>.29 and z<1.5:
            allowed={n+'_'+suffix for n in ['UpperArm','LowerArm','Hand']}
            if ax<.37:allowed.add('Spine')
        else:
            allowed={'Hips','Spine','Neck','Head'}
            if ax>.22 and z<1.5:allowed.add('UpperArm_'+suffix)
        def distance(name):
            a,b,_=segments[name];a=Vector(a);d=Vector(b)-a;t=max(0,min(1,(v.co-a).dot(d)/d.length_squared));return (v.co-a-d*t).length
        nearest=sorted(allowed,key=distance)[:2]
        values=[(name,1/(distance(name)+.025)**4) for name in nearest];total=sum(w for _,w in values)
        for index in [g.group for g in v.groups]:o.vertex_groups[index].remove([v.index])
        for name,w in values:o.vertex_groups[name].add([v.index],w/total,'REPLACE')
    # Blend adjacent weights across the shoulder/hip region boundaries.
    neighbors=[set() for _ in o.data.vertices]
    for edge in o.data.edges:
        a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
    for _ in range(3):
        previous=[{g.group:g.weight for g in v.groups} for v in o.data.vertices]
        for v in o.data.vertices:
            ids=neighbors[v.index]
            if not ids:continue
            combined={k:w*.5 for k,w in previous[v.index].items()}
            for n in ids:
                for k,w in previous[n].items():combined[k]=combined.get(k,0)+w*.5/len(ids)
            for index in [g.group for g in v.groups]:o.vertex_groups[index].remove([v.index])
            for index,w in combined.items():o.vertex_groups[index].add([v.index],w,'REPLACE')
    o.data.validate(clean_customdata=True);o.data.update()
missing=sum(1 for o in meshes for v in o.data.vertices if not v.groups)
if missing:raise RuntimeError(f'Automatic weights left {missing} vertices unbound')
for im in bpy.data.images:
    if im.size[0]>1024 or im.size[1]>1024:im.scale(1024,1024)
    if im.source!='VIEWER':
        try:im.pack()
        except RuntimeError:pass
for o in bpy.context.selected_objects:o.select_set(False)
for o in meshes+[rig]:o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(output/'athlete-rig.blend'))
bpy.ops.export_scene.gltf(filepath=str(output/'athlete-rig.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_yup=True,export_image_format='JPEG',export_jpeg_quality=90)
report={'source':str(source),'height':1.96,'bones':list(segments),'vertices':sum(len(o.data.vertices) for o in meshes),'polygons':sum(len(o.data.polygons) for o in meshes),'unweightedVertices':missing,'textureLimit':1024,'rigging':'Anatomical capsule distance weights with adjacency smoothing, locally authored humanoid skeleton','outputs':['athlete-rig.glb','athlete-rig.blend']}
(output/'rig-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
