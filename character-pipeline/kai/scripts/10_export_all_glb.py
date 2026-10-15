"""Step 10: merge Serve (kai_05_serve) + Forehand/Backhand (kai_07_ground) into one GLB.

All three animations are baked to frame ranges starting at 1 on the SAME rig (identical bone set):
  Serve     frames 1..151   (ball action Serve_Ball)
  Forehand  frames 161..293 (ball action Forehand_Ball)
  Backhand  frames 303..435 (ball action Backhand_Ball)
The glTF exporter collects every action that has use_fake_user, so we keep three rig actions and three
ball actions, each with an f-curve NLA track-less strip-free name matching the game contract. Re-import
verifies bones / meshes / triangles / actions / frame counts.
"""
import bpy, os, sys, json, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT
SERVE_BLEND = os.path.join(ROOT, "kai_05_serve.blend")
GROUND_BLEND = os.path.join(ROOT, "kai_07_ground.blend")
MERGED = os.path.join(ROOT, "kai_08_all.blend")

# start from the ground blend (has all 4 ground actions + correct rig/mesh)
bpy.ops.wm.open_mainfile(filepath=GROUND_BLEND)
# append the serve actions from the serve blend
with bpy.data.libraries.load(SERVE_BLEND, link=False) as (src, dst):
    dst.actions = ["Kai_RigAction", "Kai_BallAction.001"]
serve_rig_act = next(a for a in bpy.data.actions if a.name == "Kai_RigAction")
serve_ball_act = next(a for a in bpy.data.actions if a.name == "Kai_BallAction.001")
serve_rig_act.name = "Serve"; serve_ball_act.name = "Serve_Ball"
for a in (serve_rig_act, serve_ball_act): a.use_fake_user = True

def all_fcurves(act):
    """Blender 5.2 slotted actions: fcurves live in layer strip channelbags."""
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for slot in act.slots:
                cb = strip.channelbag(slot)
                if cb is not None: out.extend(cb.fcurves)
    return out

def add_nla_track(obj, name, action, start):
    """One NLA track per action -> glTF exports each strip action as a separate animation."""
    if obj.animation_data is None:
        obj.animation_data_create()
    ad = obj.animation_data
    ad.action = None                      # no active action; strips carry all clips
    tr = ad.nla_tracks.new(); tr.name = name
    a0, a1 = int(action.frame_range[0]), int(action.frame_range[1])
    st = tr.strips.new(name, start=start, action=action)
    st.action_frame_start = float(a0); st.action_frame_end = float(a1)
    st.name = name
    return st

# NLA layout: Serve 1..151, Forehand 161.., Backhand 303.. (non-overlapping, clean clip ranges)
rig_obj = bpy.data.objects["Kai_Rig"]; ball_obj = bpy.data.objects["Kai_Ball"]
add_nla_track(rig_obj, "Serve", bpy.data.actions["Serve"], 1)
add_nla_track(ball_obj, "Serve_Ball", bpy.data.actions["Serve_Ball"], 1)
add_nla_track(rig_obj, "Forehand", bpy.data.actions["Forehand"], 161)
add_nla_track(ball_obj, "Forehand_Ball", bpy.data.actions["Forehand_Ball"], 161)
add_nla_track(rig_obj, "Backhand", bpy.data.actions["Backhand"], 303)
add_nla_track(ball_obj, "Backhand_Ball", bpy.data.actions["Backhand_Ball"], 303)
for a in bpy.data.actions:
    a.use_fake_user = True

# make sure all actions survive export
for a in bpy.data.actions:
    a.use_fake_user = True
# select only Kai objects; drop QA helpers
for o in list(bpy.data.objects):
    if o.name.startswith(("QA_", "Baseline", "Centre", "DiagFloor", "DiagCam")):
        bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    o.select_set(o.name.startswith("Kai_"))

bpy.ops.wm.save_as_mainfile(filepath=MERGED)

out = os.path.join(ROOT, "export", "kai.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
                          export_skins=True, export_all_influences=False, export_apply=False,
                          export_yup=True, export_frame_range=False, export_force_sampling=False,
                          export_image_format='AUTO', export_materials='EXPORT')
print("EXPORTED", out, os.path.getsize(out))

# re-import verify
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=out)
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
acts = sorted(a.name for a in bpy.data.actions)
tris = 0
for m in meshes:
    m.data.calc_loop_triangles(); tris += len(m.data.loop_triangles)
fr = {a.name: (int(a.frame_range[0]), int(a.frame_range[1])) for a in bpy.data.actions}
print("REIMPORT", len(arms), "bones", len(arms[0].data.bones) if arms else 0, "meshes", len(meshes),
      "triangles", tris, "actions", acts)
print("FRAMES", fr)
json.dump({"file": "export/kai.glb", "bytes": os.path.getsize(out),
           "bones": len(arms[0].data.bones) if arms else 0, "meshes": len(meshes), "triangles": tris,
           "actions": acts, "frame_ranges": fr},
          open(os.path.join(ROOT, "qa", "export_check.json"), "w"), indent=1)
