"""QA turnaround: front / side / back / 3-4 renders of the current .blend."""
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
src = args[0] if args else "kai_03_outfit.blend"
tag = args[1] if len(args) > 1 else "turnaround"
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, src))
for o in bpy.data.objects:
    if o.name in ("Kai_Racket", "Kai_Ball", "Kai_StringBed") and tag.startswith("turn"):
        o.hide_render = True
rig = bpy.data.objects.get("Kai_Rig")
if rig:
    rig.hide_render = True
setup_render((700, 1000))
add_lights(); ground()
tz = 0.95
views = {"front": (0, -6, tz), "side": (6, 0, tz), "back": (0, 6, tz), "threequarter": (4.2, -4.2, tz + 0.4)}
for k, loc in views.items():
    cam = camera("QA_Cam_" + k, loc, (0, 0, tz), ortho=2.15)
    render(os.path.join(ROOT, "renders", f"{tag}_{k}.png"), cam)
# face close-up
cam = camera("QA_Cam_face", (0.35, -1.25, 1.76), (0, -0.05, 1.72), lens=85)
render(os.path.join(ROOT, "renders", f"{tag}_face.png"), cam)
print("RENDERED")
