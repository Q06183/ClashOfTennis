"""Segment one serve from a mocap take and render stick-figure contact sheets (side + front) for inspection.
BVH units = cm, Y up.  Also estimates contact frame = hitting-wrist height peak and the serve direction."""
import os, sys, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bvh_tools import parse_bvh, fk, DATA
from PIL import Image, ImageDraw

fn = sys.argv[1] if len(sys.argv) > 1 else "jarua_Servicio.bvh"
idx = int(sys.argv[2]) if len(sys.argv) > 2 else 1
OUT = "/Users/bytedance/Desktop/TennisClash/character-pipeline/kai/qa/mocap"
os.makedirs(OUT, exist_ok=True)
joints, frames, dt = parse_bvh(os.path.join(DATA, fn))
W = [fk(joints, fr) for fr in frames]
head = [w["Head"][0][1] for w in W]
rw = [w["RightWrist"][0][1] for w in W]
pk = []
for i in range(1, len(rw) - 1):
    if rw[i] >= rw[i - 1] and rw[i] > rw[i + 1] and rw[i] > head[i] + 25:
        if pk and i - pk[-1] < 120:
            if rw[i] > rw[pk[-1]]: pk[-1] = i
        else: pk.append(i)
print("contacts(frames)", pk, "heights", [round(rw[i]) for i in pk])
C = pk[idx]
s0, s1 = C - 160, C + 90           # 1.6 s before contact .. 0.9 s after
s0 = max(0, s0); s1 = min(len(W) - 1, s1)
# body facing at the start: chest normal from shoulders
def v(a, b): return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
w0 = W[s0]
sh = v(w0["RightShoulder"][0], w0["LeftShoulder"][0])
print("shoulder line (R->L) at start", [round(x, 1) for x in sh], "hips", [round(x, 1) for x in w0["Hips"][0]])
# hitting direction: hips displacement from start to end of segment (serve moves into court)
d = v(W[s0]["Hips"][0], W[s1]["Hips"][0]); print("hips travel", [round(x, 1) for x in d])
BONES = [("Hips", "Chest"), ("Chest", "Neck"), ("Neck", "Head"), ("Head", "Head_End"),
         ("Chest", "LeftShoulder"), ("LeftShoulder", "LeftElbow"), ("LeftElbow", "LeftWrist"),
         ("Chest", "RightShoulder"), ("RightShoulder", "RightElbow"), ("RightElbow", "RightWrist"),
         ("Hips", "LeftHip"), ("LeftHip", "LeftKnee"), ("LeftKnee", "LeftAnkle"), ("LeftAnkle", "LeftAnkle_End"),
         ("Hips", "RightHip"), ("RightHip", "RightKnee"), ("RightKnee", "RightAnkle"), ("RightAnkle", "RightAnkle_End")]
names = set(W[0].keys())
BONES = [(a, b) for a, b in BONES if a in names and b in names]
print("joint names", sorted(names))
def sheet(axis_h, label, step=10):
    fr = list(range(s0, s1 + 1, step)); cols = 9; rows = math.ceil(len(fr) / cols)
    cw, ch = 200, 260; img = Image.new("RGB", (cols * cw, rows * ch), (238, 240, 232)); dr = ImageDraw.Draw(img)
    cx0 = W[C]["Hips"][0]
    for k, f in enumerate(fr):
        ox, oy = (k % cols) * cw, (k // cols) * ch
        w = W[f]
        def P(p):
            h = (p[axis_h] - cx0[axis_h]); return (ox + cw / 2 + h * 0.75, oy + ch - 12 - p[1] * 0.75)
        dr.line([(ox, oy + ch - 12), (ox + cw, oy + ch - 12)], fill=(150, 160, 150))
        for a, b in BONES:
            col = (230, 90, 50) if "Right" in a or "Right" in b else ((40, 110, 160) if "Left" in a or "Left" in b else (40, 40, 40))
            dr.line([P(w[a][0]), P(w[b][0])], fill=col, width=3)
        dr.text((ox + 6, oy + 4), f"{f - C:+d}", fill=(0, 0, 0))
        if f == C: dr.rectangle([ox + 1, oy + 1, ox + cw - 2, oy + ch - 2], outline=(230, 90, 50), width=3)
    p = os.path.join(OUT, f"{fn[:-4]}_{idx}_{label}.png"); img.save(p); print("SHEET", p)
sheet(0, "X"); sheet(2, "Z")
json.dump({"file": fn, "serve_index": idx, "contact_frame": C, "start": s0, "end": s1, "dt": dt}, open(os.path.join(OUT, f"{fn[:-4]}_{idx}.json"), "w"))
