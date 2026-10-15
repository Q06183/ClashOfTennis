"""Step 3: athletic base body for Kai via MPFB (CC0 MakeHuman base mesh)."""
import bpy, os
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
bpy.ops.preferences.addon_enable(module="rigify")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

macro = {
    "gender": 1.0, "age": 0.5, "muscle": 0.72, "weight": 0.42,
    "proportions": 0.75, "height": 0.62, "cupsize": 0.5, "firmness": 0.5,
    "race": {"asian": 0.45, "caucasian": 0.35, "african": 0.20},
}
body = HumanService.create_human(mask_helpers=True, detailed_helpers=True,
                                 extra_vertex_groups=True, feet_on_ground=False,
                                 scale=0.1, macro_detail_dict=macro)
body.name = "Kai_Body"
# Mild stylisation toward the reference game look (bigger readable head, server's shoulders/forearm).
stack = [
    {"target": "head-scale-vert-incr", "value": 0.10},
    {"target": "head-scale-horiz-incr", "value": 0.08},
    {"target": "head-scale-depth-incr", "value": 0.05},
    {"target": "head-square", "value": 0.20},
    {"target": "l-upperarm-shoulder-muscle-incr", "value": 0.30},
    {"target": "r-upperarm-shoulder-muscle-incr", "value": 0.40},
    {"target": "r-lowerarm-muscle-incr", "value": 0.30},
    {"target": "l-lowerarm-muscle-incr", "value": 0.15},
]
TargetService.bulk_load_targets(body, stack)
bpy.context.view_layer.update()
# feet on ground after targets
dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg)
zs = [(ev.matrix_world @ v.co).z for v in ev.data.vertices]
body.location.z -= min(zs)
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("TARGETS", [(t["target"], round(t["value"], 2)) for t in TargetService.get_target_stack(body)][-8:])
print("BODY_HEIGHT_M", round(max(zs) - min(zs), 3), "VERTS", len(ev.data.vertices))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kai_01_body.blend"))
print("SAVED")
