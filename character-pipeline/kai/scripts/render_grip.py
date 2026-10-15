"""Render grip close-ups with the solved grip pose applied."""
import bpy, os, sys, json
from mathutils import Quaternion, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
G = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
rig = bpy.data.objects["Kai_Rig"]
for k, q in G["grip_q"].items(): rig.pose.bones[k].rotation_quaternion = Quaternion(q)
rig.hide_render = True
bpy.data.objects["Kai_Ball"].hide_render = True
setup_render((800, 800)); add_lights(); ground()
bpy.context.view_layer.update()
hand = rig.matrix_world @ rig.pose.bones["hand_r"].head
tgt = hand + Vector((-0.06, -0.08, -0.03))
for name, off in {"a": (-0.35, -0.35, 0.05), "b": (-0.1, -0.45, -0.15), "c": (0.15, -0.4, 0.2), "d": (-0.45, 0.1, 0.0)}.items():
    cam = camera("QA_Cam_grip_" + name, tgt + Vector(off), tgt, lens=60)
    render(os.path.join(ROOT, "renders", f"grip_{name}.png"), cam)
print("RENDERED")
