"""Step 7b: export game-ready GLB (skinned mesh + racket + ball + 'Serve' animation) and verify by re-import."""
import bpy, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_05_serve.blend"))
rig = bpy.data.objects["Kai_Rig"]
sc = bpy.context.scene
plan = json.load(open(os.path.join(ROOT, "qa", "serve_plan.json")))
sc.frame_start, sc.frame_end = plan["T"]["start"], plan["T"]["end"]
print("RANGE", sc.frame_start, sc.frame_end)
# name the action for the game
if rig.animation_data and rig.animation_data.action:
    rig.animation_data.action.name = "Serve"
ball = bpy.data.objects["Kai_Ball"]
if ball.animation_data and ball.animation_data.action:
    ball.animation_data.action.name = "Serve_Ball"
# drop QA helpers
for o in list(bpy.data.objects):
    if o.name.startswith(("QA_", "Baseline", "Centre")):
        bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    o.select_set(o.name.startswith("Kai_"))
out = os.path.join(ROOT, "export", "kai.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
                          export_skins=True, export_all_influences=False, export_apply=False,
                          export_yup=True, export_frame_range=False, export_force_sampling=True,
                          export_image_format='AUTO', export_materials='EXPORT')
print("EXPORTED", out, os.path.getsize(out))
# ---- verify by re-import into a clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=out)
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
acts = [a.name for a in bpy.data.actions]
tris = 0
for m in meshes:
    m.data.calc_loop_triangles(); tris += len(m.data.loop_triangles)
skinned = [m.name for m in meshes if any(md.type == 'ARMATURE' for md in m.modifiers)]
print("REIMPORT armatures", len(arms), "bones", len(arms[0].data.bones) if arms else 0, "meshes", len(meshes),
      "skinned", len(skinned), "triangles", tris, "actions", acts)
fr = [int(a.frame_range[1] - a.frame_range[0] + 1) for a in bpy.data.actions]
print("ACTION_FRAMES", fr)
json.dump({"file": "export/kai.glb", "bytes": os.path.getsize(out), "bones": len(arms[0].data.bones) if arms else 0,
           "meshes": len(meshes), "skinned_meshes": skinned, "triangles": tris, "actions": acts, "frames": fr},
          open(os.path.join(ROOT, "qa", "export_check.json"), "w"), indent=1)
