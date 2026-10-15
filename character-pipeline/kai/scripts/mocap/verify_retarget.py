"""Verify retarget fidelity: per frame, compare Kai bone directions with the source segment directions
(angle error), handedness, and render a side-by-side stick figure (source vs Kai) for key frames."""
import bpy, os, sys, json, math
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, world_head, world_tail
src_blend = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "kai_06_mocap_raw.blend"
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "retarget_common.py")).read())
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, src_blend))
rig = bpy.data.objects["Kai_Rig"]; sc = bpy.context.scene
errs = {kb: [] for kb, a, b in MAP}
worst = []
for k in range(sc.frame_start - 1, sc.frame_end):
    f = k + 1; sc.frame_set(f); w = sample(k / FPS)
    for kb, a, b in MAP:
        ds = (to_bl(w[b][0], origin) - to_bl(w[a][0], origin)).normalized()
        dk = (world_tail(rig, kb) - world_head(rig, kb)).normalized()
        e = math.degrees(ds.angle(dk)); errs[kb].append(e)
        if e > 10: worst.append((round(e), kb, f))
print("ERR_DEG mean/max per bone:")
for kb, v in errs.items(): print(f"  {kb:12s} {sum(v)/len(v):6.2f} {max(v):6.2f}")
print("WORST", sorted(worst, reverse=True)[:12])
# handedness at contact: which Kai hand is highest?
sc.frame_set(C_FRAME)
print("CONTACT hand_r z", round(world_tail(rig, "hand_r").z, 2), "hand_l z", round(world_tail(rig, "hand_l").z, 2),
      "head z", round(world_tail(rig, "head").z, 2), "pelvis", tuple(round(x, 2) for x in world_head(rig, "pelvis")))
