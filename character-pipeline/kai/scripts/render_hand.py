import bpy, os, sys, json
from mathutils import Quaternion, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_04_rigged.blend"))
G = json.load(open(os.path.join(ROOT, "qa", "grip.json")))
rig = bpy.data.objects["Kai_Rig"]
for k, q in G["grip_q"].items(): rig.pose.bones[k].rotation_quaternion = Quaternion(q)
rig.hide_render = True; bpy.data.objects["Kai_Ball"].hide_render = True
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name not in ("Kai_Body", "Kai_Racket", "Kai_StringBed", "Kai_Wristband_R"): o.hide_render = True
setup_render((700, 700)); add_lights()
bpy.context.view_layer.update()
B = {b.name: b for b in rig.data.bones}
hand, mid0 = B["hand_r"].head_local, B["middle_01_r"].head_local
a = (mid0 - hand).normalized(); lat = (B["index_01_r"].head_local - B["pinky_01_r"].head_local).normalized()
n = a.cross(lat).normalized(); n = -n   # palmar side (tips lie on -n)
c = hand.lerp(mid0, 0.6)
views = {"palm": c + n * 0.35, "back": c - n * 0.35, "thumbside": c + lat * 0.35 + n * 0.05, "pinkyside": c - lat * 0.35 + n * 0.05}
for k, loc in views.items():
    cam = camera("QA_Cam_h_" + k, loc, c, lens=70)
    render(os.path.join(ROOT, "renders", f"hand_{k}.png"), cam)
print("RENDERED")
