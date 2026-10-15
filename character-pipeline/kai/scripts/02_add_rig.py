import bpy, os
from mathutils import Vector
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "kai_01_body.blend"))
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
b = bpy.data.objects["Kai_Body"]
rig = HumanService.add_builtin_rig(b, "game_engine", import_weights=True)
rig.name = "Kai_Rig"; rig.data.name = "Kai_Rig"
bpy.context.view_layer.update()
mw = rig.matrix_world
for bn in ["pelvis","spine_03","head","upperarm_l","lowerarm_l","hand_l","upperarm_r","hand_r","thigh_l","calf_l","foot_l","ball_l","index_01_r","pinky_01_r","thumb_01_r","middle_01_r"]:
    bb = rig.data.bones[bn]
    print("BONE", bn, tuple(round(x,3) for x in mw@bb.head_local), tuple(round(x,3) for x in mw@bb.tail_local), "roll-z", tuple(round(x,2) for x in (mw.to_3x3()@bb.matrix_local.to_3x3()).col[2]))
vg = {g.index: g.name for g in b.vertex_groups}
helpers_weighted = {}
bones = set(rig.data.bones.keys())
for v in b.data.vertices:
    names = [vg[g.group] for g in v.groups]
    hel = [n for n in names if n.startswith("helper")]
    if hel:
        w = any(n in bones for n in names)
        helpers_weighted[hel[0]] = helpers_weighted.get(hel[0], [0,0])
        helpers_weighted[hel[0]][0 if w else 1] += 1
print("HELPER_WEIGHTED", helpers_weighted)
# nose tip -> facing
ev = b
ys = [(b.matrix_world @ v.co) for v in b.data.vertices]
head_z = max(p.z for p in ys)
front = min((p for p in ys if p.z > head_z-0.15), key=lambda p: p.y)
back = max((p for p in ys if p.z > head_z-0.15), key=lambda p: p.y)
print("FACE_FRONT_Y", round(front.y,3), "BACK_Y", round(back.y,3))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kai_02_rigged_raw.blend"))
print("SAVED")
