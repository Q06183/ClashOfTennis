"""Rasterize exported real scene geometry for proportion checks; not GPU proof."""
import io
import json
import pathlib
import struct
import numpy as np
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/court-realism"
scenes = json.loads((OUT / "projected-scene.json").read_text())
raw = (ROOT / "public/models/athlete.glb").read_bytes()
length = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20:20+length])
binary = raw[28+length:]
v = doc["bufferViews"][doc["images"][0]["bufferView"]]
texture = np.asarray(Image.open(io.BytesIO(binary[v["byteOffset"]:v["byteOffset"]+v["byteLength"]])).convert("RGB")) / 255

for scene in scenes:
    W, H = scene["width"], scene["height"]
    pixels = np.zeros((H, W, 3), dtype=float) + [.72, .82, .76]
    depth = np.full((H, W), np.inf)
    for mesh in scene["meshes"]:
        pos = np.array(mesh["points"]).reshape(-1, 3)
        uv = np.array(mesh["uv"]).reshape(-1, 2) if mesh["uv"] else None
        for ids in np.array(mesh["indices"]).reshape(-1, 3):
            pts = pos[ids]
            if np.any(pts[:, 2] < -1) or np.all(pts[:, 2] > 1):
                continue
            tri = pts[:, :2]
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
            z = weights@pts[:, 2]
            visible = (a >= 0) & (b >= 0) & (c >= 0) & (z < depth[yy, xx])
            if not visible.any():
                continue
            if mesh["textured"] and uv is not None:
                coords = weights@uv[ids]
                tx = np.clip((coords[..., 0]*texture.shape[1]).astype(int), 0, texture.shape[1]-1)
                ty = np.clip((coords[..., 1]*texture.shape[0]).astype(int), 0, texture.shape[0]-1)
                color = texture[ty, tx]
            else:
                color = np.broadcast_to(np.array(mesh["color"])**(1/2.2), (*z.shape, 3))
            pixels[yy[visible], xx[visible]] = color[visible]
            depth[yy[visible], xx[visible]] = z[visible]
    image = Image.fromarray(np.round(np.clip(pixels, 0, 1)*255).astype(np.uint8))
    ImageDraw.Draw(image).text((12, 12), f"{scene['mode']} - {W}x{H} - CPU geometry preview", fill="white")
    image.save(OUT / f"{scene['mode']}-{W}x{H}.png")
for W, H in [(390, 844), (780, 600)]:
    comparison = Image.new("RGB", (W*2, H))
    comparison.paste(Image.open(OUT / f"before-{W}x{H}.png"), (0, 0))
    comparison.paste(Image.open(OUT / f"after-{W}x{H}.png"), (W, 0))
    comparison.save(OUT / f"comparison-{W}x{H}.png")
print("Saved before/after court scale images.")
