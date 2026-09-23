"""Refine owned athlete meshes, anatomical weights, and individual uniform trim.
Run in Blender: --background --python scripts/assets/refine-athletes.py -- SOURCE_ROOT
SOURCE_ROOT must be the models from baseline commit 5acf3fe, not prior output.
No external asset generation or credits. Existing faces, UVs and identity preserved.
"""
import bpy,sys,pathlib,math,json,colorsys
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=pathlib.Path(sys.argv[sys.argv.index('--')+1]).resolve()
# name, shirt, edge, side-panel, muscular volume, stripe layout
PROFILES=[
 ('lin',(0.86,.83,.70,1),(.12,.28,.30,1),(.24,.38,.39,1),.07,'classic'),
 ('mei',(.045,.40,.38,1),(.56,.86,.72,1),(.035,.20,.23,1),.055,'shoulder'),
 ('rafa',(.64,.10,.045,1),(.98,.69,.25,1),(.24,.045,.035,1),.12,'diagonal'),
 ('sora',(.055,.16,.55,1),(.63,.83,.98,1),(.025,.065,.22,1),.055,'chest'),
 ('ines',(.34,.07,.48,1),(.90,.53,.73,1),(.14,.025,.23,1),.085,'shoulder'),
 ('leo',(.07,.23,.10,1),(.83,.69,.30,1),(.025,.085,.05,1),.10,'classic'),
 ('noah',(.025,.20,.32,1),(.34,.81,.75,1),(.015,.075,.13,1),.12,'diagonal'),
 ('adrian',(.34,.13,.04,1),(.90,.69,.36,1),(.10,.045,.02,1),.075,'chest'),
 ('luca',(.28,.095,.38,1),(.83,.66,.91,1),(.115,.035,.18,1),.055,'shoulder')]
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def mat(name,color,roughness=.78):
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=roughness
 return m
reports=[]
for name,color,trim,side,muscle,pattern in PROFILES:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 # These three were material-only derivatives (special-characters.py). Start
 # from their identical geometry/face master to remove the old rectangular paint.
 source_name={'noah':'rafa','adrian':'leo','luca':'mei'}.get(name,name)
 path=SOURCE/('athlete.glb' if name=='lin' else f'characters/{source_name}.glb')
 bpy.ops.import_scene.gltf(filepath=str(path))
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 bones=rig.data.bones
 changed=0;fabric=0
 for o in [o for o in bpy.context.scene.objects if o.type=='MESH']:
  for bone in bones:
   if bone.name not in o.vertex_groups:o.vertex_groups.new(name=bone.name)
  # Imported vertices/bones share armature coordinates after normalizing transform.
  to_rig=rig.matrix_world.inverted()@o.matrix_world;to_mesh=to_rig.inverted()
  for v in o.data.vertices:
   p=to_rig@v.co;x,y,z=p;ax=abs(x);suffix='L' if x>0 else 'R'
   old={o.vertex_groups[g.group].name:g.weight for g in v.groups}
   if z>.76:
    boundary=smooth(.91,1.15,z);lo=.29-.09*boundary;hi=.38-.02*boundary
    arm_mix=smooth(lo,hi,ax)*(1-smooth(1.48,1.59,z))
    arm_names=[n+'_'+suffix for n in ['UpperArm','LowerArm','Hand']]
    def distance(n):
     b=bones[n];d=b.tail_local-b.head_local;t=max(0,min(1,(p-b.head_local).dot(d)/d.length_squared));return (p-b.head_local-d*t).length
    upper,lower,hand=[bones[n] for n in arm_names]
    elbow_axis=((upper.tail_local-upper.head_local).normalized()+(lower.tail_local-lower.head_local).normalized()).normalized()
    wrist_axis=((lower.tail_local-lower.head_local).normalized()+(hand.tail_local-hand.head_local).normalized()).normalized()
    bend=smooth(-.08,.08,(p-lower.head_local).dot(elbow_axis));wrist=smooth(-.045,.045,(p-hand.head_local).dot(wrist_axis))
    aw={arm_names[0]:1-bend,arm_names[1]:bend*(1-wrist),arm_names[2]:bend*wrist}
    body={n:w for n,w in old.items() if not ('Arm' in n or 'Hand' in n)}
    if not body:body={'Hips':1}
    total=sum(body.values());body={n:w/total for n,w in body.items()}
    neck=smooth(1.48,1.64,z);head=smooth(1.60,1.72,z)
    upper_body={'Spine':1-neck,'Neck':neck*(1-head),'Head':neck*head}
    transition=smooth(.98,1.25,z)
    body={n:w*(1-transition) for n,w in body.items()}
    for n,w in upper_body.items():body[n]=body.get(n,0)+w*transition
    weights={n:w*(1-arm_mix) for n,w in body.items()}
    for n,w in aw.items():weights[n]=weights.get(n,0)+w*arm_mix
    for group in [g.group for g in v.groups]:o.vertex_groups[group].remove([v.index])
    for n,w in weights.items():
     if w>1e-6:o.vertex_groups[n].add([v.index],w,'REPLACE')
   # Small localized volume shaping along muscle bellies, leaving joints fixed.
   weights={o.vertex_groups[g.group].name:g.weight for g in v.groups}
   delta=Vector((0,0,0))
   for n,w in weights.items():
    if not n.startswith(('UpperArm','LowerArm','UpperLeg','LowerLeg')) or w<.12:continue
    b=bones[n];d=b.tail_local-b.head_local;t=(p-b.head_local).dot(d)/d.length_squared
    if not 0<t<1:continue
    radial=p-(b.head_local+d*t);envelope=math.sin(math.pi*t)**2
    strength=muscle*(1 if n.startswith('UpperArm') else .55 if n.startswith('LowerArm') else .5)
    # Upper arm shoulder/biceps, tapered forearm and athletic thigh/calf volumes.
    delta+=radial*(strength*envelope*w)
   if delta.length>1e-6:v.co=to_mesh@(p+delta);changed+=1
  # Bake surface-space tailoring into the existing UV texture. Selecting whole
  # mesh faces makes a jagged collar/hem and aliased stripes on coarse triangles.
  import numpy as np
  def nsmooth(a,b,x):
   t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
  texture_jobs={}
  for mi,m in enumerate(o.data.materials):
   shader=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   linked=shader.inputs['Base Color'].links[0].from_node if shader and shader.inputs['Base Color'].links else None
   if linked and linked.type=='TEX_IMAGE' and linked.image:
    image=linked.image;w,h=image.size;pixels=np.empty(w*h*4,dtype=np.float32);image.pixels.foreach_get(pixels)
    texture_jobs[mi]=(linked,image,pixels.reshape(h,w,4).copy(),pixels.reshape(h,w,4).copy())
  o.data.calc_loop_triangles()
  uv=o.data.uv_layers.active
  for tri in o.data.loop_triangles:
   job=texture_jobs.get(tri.material_index)
   if not job or not uv:continue
   linked,image,original,output=job;h,w=original.shape[:2]
   pts=np.array([tuple(to_rig@o.data.vertices[i].co) for i in tri.vertices])
   if pts[:,2].max()<.84 or pts[:,2].min()>1.68:continue
   tex=np.array([tuple(uv.data[i].uv) for i in tri.loops])*[w,h]-.5
   low=np.maximum(0,np.floor(tex.min(axis=0)).astype(int));high=np.minimum([w-1,h-1],np.ceil(tex.max(axis=0)).astype(int))
   if np.any(high<low):continue
   xx,yy=np.meshgrid(np.arange(low[0],high[0]+1),np.arange(low[1],high[1]+1))
   v0=tex[1]-tex[0];v1=tex[2]-tex[0];den=v0[0]*v1[1]-v0[1]*v1[0]
   if abs(den)<1e-8:continue
   dx=xx-tex[0,0];dy=yy-tex[0,1];b=(dx*v1[1]-dy*v1[0])/den;c=(v0[0]*dy-v0[1]*dx)/den;a=1-b-c
   inside=(a>=-1e-5)&(b>=-1e-5)&(c>=-1e-5)
   pos=a[...,None]*pts[0]+b[...,None]*pts[1]+c[...,None]*pts[2];x=pos[...,0];z=pos[...,2]
   rgb=original[yy,xx,:3];hi=rgb.max(axis=-1);lo=rgb.min(axis=-1);d=hi-lo;s=d/np.maximum(hi,1e-6)
   hue=np.zeros_like(hi);nz=d>1e-6
   for channel in range(3):
    mask=nz&(np.argmax(rgb,axis=-1)==channel)
    hue[mask]=((rgb[...,(channel+1)%3][mask]-rgb[...,(channel+2)%3][mask])/d[mask]+channel*2)/6
   hue%=1
   # Color masks retain source skin, hair and the true garment outline.
   masks={'lin':(1-nsmooth(.17,.25,s))*nsmooth(.28,.42,hi),
    'mei':nsmooth(.34,.38,hue)*(1-nsmooth(.58,.62,hue))*nsmooth(.16,.28,s),
    'rafa':(1-nsmooth(.035,.075,np.minimum(hue,1-hue)))*nsmooth(.30,.45,s),
    'sora':nsmooth(.50,.55,hue)*(1-nsmooth(.74,.78,hue))*nsmooth(.20,.34,s),
    'ines':nsmooth(.66,.71,hue)*(1-nsmooth(.9,.94,hue))*nsmooth(.16,.28,s),
    'leo':nsmooth(.18,.23,hue)*(1-nsmooth(.46,.51,hue))*nsmooth(.17,.28,s)}
   mask=masks[source_name]*nsmooth(.84,.90,z)*(1-nsmooth(1.63,1.68,z))*inside
   if mask.max()<.01:continue
   fabric+=1
   edge=nsmooth(.19,.245,np.abs(x));shade=.80+.24*hi
   base=np.array(color[:3])[None,None,:]*(1-edge[...,None])+np.array(side[:3])[None,None,:]*edge[...,None]
   if pattern=='classic':stripe=1-nsmooth(.009,.014,np.abs(z-1.105))
   elif pattern=='chest':stripe=1-nsmooth(.014,.020,np.abs(z-1.30))
   elif pattern=='diagonal':stripe=1-nsmooth(.012,.019,np.abs(z-(1.24+x*.36)))
   else:stripe=1-nsmooth(.012,.019,np.abs(z-(1.38-np.abs(x)*.48)))
   stripe*=1-nsmooth(.20,.24,np.abs(x));accent=np.maximum(stripe,(1-nsmooth(.005,.012,np.abs(z-.955)))*.75)
   desired=(base*(1-accent[...,None])+np.array(trim[:3])*accent[...,None])*shade[...,None]
   # Profiles are linear material colors; image.pixels for this sRGB image uses
   # encoded color values. Encode before writing so GLTF keeps the intended hue.
   desired=np.where(desired<=.0031308,desired*12.92,1.055*np.maximum(desired,0)**(1/2.4)-.055)
   output[yy,xx,:3]=np.where(inside[...,None],rgb*(1-mask[...,None])+desired*mask[...,None],output[yy,xx,:3])
  for linked,image,original,output in texture_jobs.values():
   refined=bpy.data.images.new(name+'-tailored-uniform',width=image.size[0],height=image.size[1],alpha=True)
   refined.colorspace_settings.name=image.colorspace_settings.name;refined.pixels.foreach_set(output.ravel());refined.update();refined.pack();linked.image=refined
  o.data.update()
 # A small cloth sweatband uses the same forearm bone, not a floating prop.
 # Radius comes from this character's mesh so slim and muscular wrists differ.
 # Runtime mirrors the complete canonical right-handed rig for left-handers.
 suffix='R';bone=bones['LowerArm_'+suffix]
 axis=(bone.tail_local-bone.head_local).normalized();centre=bone.head_local.lerp(bone.tail_local,.84)
 radii=[]
 for o in [o for o in bpy.context.scene.objects if o.type=='MESH']:
  transform=rig.matrix_world.inverted()@o.matrix_world
  for vertex in o.data.vertices:
   point=transform@vertex.co-centre;along=point.dot(axis);radial=(point-axis*along).length
   if abs(along)<.025 and .03<radial<.13:radii.append(radial)
 radii.sort();radius=min(.095,max(.045,(radii[int(len(radii)*.8)] if radii else .06)+.004))
 u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u).normalized();vertices=[];faces=[]
 for end in [-.019,.019]:
  for j in range(24):vertices.append(centre+axis*end+radius*(u*math.cos(j*math.tau/24)+v*math.sin(j*math.tau/24)))
 for j in range(24):faces.append((j,(j+1)%24,(j+1)%24+24,j+24))
 mesh=bpy.data.meshes.new(name+'-sweatband');mesh.from_pydata(vertices,[],faces);mesh.update()
 cuff=bpy.data.objects.new(name+'-sweatband',mesh);bpy.context.collection.objects.link(cuff);cuff.parent=rig
 group=cuff.vertex_groups.new(name=bone.name);group.add(list(range(len(vertices))),1,'REPLACE')
 modifier=cuff.modifiers.new('AthleteSkeleton','ARMATURE');modifier.object=rig
 cuff.data.materials.append(mat(name+'-sweatband-knit',trim,.95))
 for polygon in mesh.polygons:polygon.use_smooth=True
 # Save editable source alongside the existing source rig, never add baked animations.
 out=ROOT/('assets/athlete/rigged' if name=='lin' else f'assets/characters/{name}');out.mkdir(parents=True,exist_ok=True)
 for im in bpy.data.images:
  if im.source!='VIEWER':
   try:im.pack()
   except RuntimeError:pass
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'athlete-refined.blend'))
 dest=ROOT/('public/models/athlete.glb' if name=='lin' else f'public/models/characters/{name}.glb')
 bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',export_animations=False,export_skins=True,export_yup=True,export_image_format='JPEG',export_jpeg_quality=90)
 reports.append({'id':name,'baselineCommit':'5acf3fe','muscleVolume':muscle,'sculptedVertices':changed,'fabricFaces':fabric,'trim':pattern,'model':str(dest.relative_to(ROOT)),'editable':str((out/'athlete-refined.blend').relative_to(ROOT)),'sweatbandBone':bone.name,'sweatbandVertices':len(vertices),'externalCredits':0})
(ROOT/'assets/characters/refinement-report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(reports))
