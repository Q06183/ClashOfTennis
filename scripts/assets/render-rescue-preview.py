"""CPU preview of exported runtime-skinned vertices, not a browser screenshot."""
import io
import json
import pathlib
import struct
import os
import numpy as np
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / os.environ.get("POSE_PREVIEW_DIR", "artifacts/jump-rescue")
rows = json.loads((OUT / "poses.json").read_text())
raw = (ROOT / "public/models/athlete.glb").read_bytes()
length = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20:20+length])
binary = raw[28+length:]
image = doc["images"][0]
v = doc["bufferViews"][image["bufferView"]]
texture = np.asarray(Image.open(io.BytesIO(binary[v["byteOffset"]:v["byteOffset"]+v["byteLength"]])).convert("RGB")) / 255

W, H = 260, 300
eye = np.array([5., 3., 8.])
target = np.array([0., 1.4, 0.])
forward = target-eye
forward /= np.linalg.norm(forward)
right = np.cross(forward, [0, 1, 0])
right /= np.linalg.norm(right)
up = np.cross(right, forward)
light = np.array([.3, .8, .5])
light /= np.linalg.norm(light)
sheet = Image.new("RGB", (W*max(len(row["frames"]) for row in rows), (H+28)*len(rows)), "#e6ebdf")
draw = ImageDraw.Draw(sheet)

for row, data in enumerate(rows):
    for col, frame in enumerate(data["frames"]):
        pixels = np.zeros((H, W, 3), dtype=float) + [.90, .92, .87]
        depth = np.full((H, W), np.inf)
        for mesh in frame["meshes"]:
            pos = np.array(mesh["points"]).reshape(-1, 3)
            uv = np.array(mesh["uv"]).reshape(-1, 2) if mesh["uv"] else None
            rel = pos-target
            screen = np.column_stack((W/2+(rel@right)*H/3.5, H/2-(rel@up)*H/3.5))
            depths = (pos-eye)@forward
            for ids in np.array(mesh["indices"]).reshape(-1, 3):
                tri = screen[ids]
                lo = np.maximum(0, np.floor(tri.min(axis=0)).astype(int))
                hi = np.minimum([W-1, H-1], np.ceil(tri.max(axis=0)).astype(int))
                if np.any(hi < lo):
                    continue
                a0, a1 = tri[1]-tri[0], tri[2]-tri[0]
                den = a0[0]*a1[1]-a0[1]*a1[0]
                if abs(den) < 1e-8:
                    continue
                xx, yy = np.meshgrid(np.arange(lo[0], hi[0]+1), np.arange(lo[1], hi[1]+1))
                dx, dy = xx+.5-tri[0, 0], yy+.5-tri[0, 1]
                b, c = (dx*a1[1]-dy*a1[0])/den, (a0[0]*dy-a0[1]*dx)/den
                a = 1-b-c
                weights = np.stack((a, b, c), axis=-1)
                z = weights@depths[ids]
                visible = (a >= 0) & (b >= 0) & (c >= 0) & (z < depth[yy, xx])
                if not visible.any():
                    continue
                normal = np.cross(pos[ids[1]]-pos[ids[0]], pos[ids[2]]-pos[ids[0]])
                normal /= max(1e-8, np.linalg.norm(normal))
                shade = .65+.4*abs(normal@light)
                if mesh["textured"] and uv is not None:
                    coords = weights@uv[ids]
                    tx = np.clip((coords[..., 0]*texture.shape[1]).astype(int), 0, texture.shape[1]-1)
                    ty = np.clip((coords[..., 1]*texture.shape[0]).astype(int), 0, texture.shape[0]-1)
                    color = texture[ty, tx]*shade
                else:
                    color = np.broadcast_to(np.array(mesh["color"])**(1/2.2)*shade, (*z.shape, 3))
                pixels[yy[visible], xx[visible]] = color[visible]
                depth[yy[visible], xx[visible]] = z[visible]
        tile = Image.fromarray(np.round(np.clip(pixels, 0, 1)*255).astype(np.uint8))
        ink = ImageDraw.Draw(tile)
        if frame.get("contact") and abs(frame["age"]-.18) < .01:
            p = frame["contact"]
            rel = np.array([p["x"], p["y"], p["z"]])-target
            x, y = W/2+rel@right*H/3.5, H/2-rel@up*H/3.5
            ink.ellipse((x-4, y-4, x+4, y+4), fill="#d2e836", outline="#586a17")
        sheet.paste(tile, (col*W, row*(H+28)+28))
        draw.text((col*W+10, row*(H+28)+8), f"{data['stroke']} / {frame['age']:.2f}s", fill="#173e40")
sheet.save(OUT / "four-jumps.png")
print(OUT / "four-jumps.png")
