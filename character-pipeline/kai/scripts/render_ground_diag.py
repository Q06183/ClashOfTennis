"""Diagnostic renders of groundstroke retarget: contact window, side + front."""
import bpy, os, sys
sys.path.insert(0,"/Users/bytedance/Desktop/TennisClash/character-pipeline/kai/scripts")
from common import setup_render, add_lights
from mathutils import Vector
ROOT="/Users/bytedance/Desktop/TennisClash/character-pipeline/kai"
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,"kai_07_ground.blend"))
sc=bpy.context.scene; rig=bpy.data.objects["Kai_Rig"]
setup_render((720,900)); add_lights()
if "DiagFloor" not in bpy.data.objects:
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0,0,0))
    bpy.context.object.name="DiagFloor"
cam_data=bpy.data.cameras.new("DiagCam"); cam=bpy.data.objects.new("DiagCam",cam_data)
sc.collection.objects.link(cam); sc.camera=cam; cam_data.lens=45
out=os.path.join(ROOT,"renders/ground_diag"); os.makedirs(out,exist_ok=True)
frames=[45,55,64,72,79,84,90,100,112]
def shoot(action_name, view):
    rig.animation_data.action=bpy.data.actions[action_name]
    tgt=Vector((0,0.9,0.95))
    if view=="side": cam.location=tgt+Vector((4.0,0.15,0.1))
    else:           cam.location=tgt+Vector((0.0,-4.0,0.1))
    cam.rotation_euler=(tgt-cam.location).to_track_quat('-Z','Y').to_euler()
    for f in frames:
        sc.frame_set(f)
        sc.render.filepath=os.path.join(out,f"{action_name}_{view}_f{f:03d}.png")
        bpy.ops.render.render(write_still=True)
for a in ("Forehand","Backhand"):
    shoot(a,"side"); shoot(a,"front")
print("DONE")
