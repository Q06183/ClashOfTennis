"""Derive Wuming from the shipped Lin GLB; never rewrite geometry/skin bytes.

python3 scripts/assets/hidden-master.py
Blender --background --python scripts/assets/render-hidden-master.py
Only uses existing project-owned assets. No external provider or credits.
"""
import hashlib
import io
import json
import pathlib
import struct

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/models/athlete.glb"
DEST = ROOT / "public/models/characters/wuming.glb"
OUT = ROOT / "assets/characters/wuming"


def smooth(a, b, value):
    t = np.clip((value-a)/(b-a), 0, 1)
    return t*t*(3-2*t)


raw = SOURCE.read_bytes()
length = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20:20+length])
binary = raw[28+length:]


def accessor(index):
    a = doc["accessors"][index]
    v = doc["bufferViews"][a["bufferView"]]
    size = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2"}[a["componentType"]]
    return np.frombuffer(binary, dtype=dtype, count=a["count"]*size,
                         offset=v.get("byteOffset", 0)+a.get("byteOffset", 0)).reshape(-1, size)


image = doc["images"][0]
view = doc["bufferViews"][image["bufferView"]]
original = np.asarray(Image.open(io.BytesIO(binary[view["byteOffset"]:view["byteOffset"]+view["byteLength"]])).convert("RGB"))
output = original.astype(np.float32)/255
base = output.copy()
h, w = base.shape[:2]
changed = np.zeros((h, w), dtype=bool)
for primitive in doc["meshes"][0]["primitives"]:
    positions = accessor(primitive["attributes"]["POSITION"])
    uv = accessor(primitive["attributes"]["TEXCOORD_0"])
    indices = accessor(primitive["indices"]).reshape(-1, 3)
    for tri in indices:
        pts = positions[tri]
        if pts[:, 1].max() < .58 or pts[:, 1].min() > 1.58:
            continue
        tex = uv[tri]*[w, h]-.5
        low = np.maximum(0, np.floor(tex.min(axis=0)).astype(int))
        high = np.minimum([w-1, h-1], np.ceil(tex.max(axis=0)).astype(int))
        if np.any(high < low):
            continue
        xx, yy = np.meshgrid(np.arange(low[0], high[0]+1), np.arange(low[1], high[1]+1))
        v0, v1 = tex[1]-tex[0], tex[2]-tex[0]
        den = v0[0]*v1[1]-v0[1]*v1[0]
        if abs(den) < 1e-8:
            continue
        dx, dy = xx-tex[0, 0], yy-tex[0, 1]
        b, c = (dx*v1[1]-dy*v1[0])/den, (v0[0]*dy-v0[1]*dx)/den
        a = 1-b-c
        inside = (a >= -1e-5) & (b >= -1e-5) & (c >= -1e-5)
        pos = a[..., None]*pts[0]+b[..., None]*pts[1]+c[..., None]*pts[2]
        x, y = np.abs(pos[..., 0]), pos[..., 1]
        rgb = base[yy, xx]
        # Lin's cream/teal fabric has much more blue relative to red than skin.
        # UV-space interpolation retains the actual neck/sleeve boundary.
        fabric = smooth(.74, .84, rgb[..., 2]/np.maximum(rgb[..., 0], .01))
        fabric *= smooth(.58, .62, y)*(1-smooth(1.51, 1.58, y))*inside
        shade = .80+.24*rgb.max(axis=-1)
        black = np.array([.085, .105, .12])
        gold = np.array([.85, .68, .32])
        chest = (1-smooth(.008, .014, np.abs(y-1.105)))*(1-smooth(.20, .24, x))
        side = smooth(.20, .235, x)*(1-smooth(.25, .275, x))*smooth(.94, 1.0, y)*(1-smooth(1.35, 1.42, y))
        hem = (1-smooth(.004, .008, np.abs(y-.96)))*(1-smooth(.25, .28, x))
        accent = np.maximum(chest, np.maximum(side, hem))
        desired = (black*(1-accent[..., None])+gold*accent[..., None])*shade[..., None]
        output[yy, xx] = np.where(inside[..., None], rgb*(1-fabric[..., None])+desired*fabric[..., None], output[yy, xx])
        changed[yy, xx] |= fabric > .95

# Extend same-colored fabric by two texels at UV seams, never across contrasting
# skin/collar edges. Otherwise linear texture sampling reveals the cream source.
for _ in range(2):
    previous = output.copy()
    marked = changed.copy()
    for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
        neighbor = np.roll(marked, (dy, dx), axis=(0, 1))
        similar = np.linalg.norm(base-np.roll(base, (dy, dx), axis=(0, 1)), axis=-1) < .08
        fill = neighbor & ~changed & similar
        fill[[0, -1], :] = False
        fill[:, [0, -1]] = False
        output[fill] = np.roll(previous, (dy, dx), axis=(0, 1))[fill]
        changed |= fill

pixels = np.round(np.clip(output, 0, 1)*255).astype(np.uint8)
png = io.BytesIO()
Image.fromarray(pixels).save(png, format="PNG")
payload = png.getvalue()
new_view = len(doc["bufferViews"])
doc["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(payload)})
image.update({"bufferView": new_view, "mimeType": "image/png", "name": "wuming-black-gold-uniform"})
for group in ["materials", "meshes", "nodes"]:
    for item in doc[group]:
        if item.get("name", "").startswith("lin-sweatband"):
            item["name"] = item["name"].replace("lin-", "wuming-", 1)
doc["materials"][1]["pbrMetallicRoughness"]["baseColorFactor"] = [.69, .42, .08, 1]
new_bin = binary+payload
doc["buffers"][0]["byteLength"] = len(new_bin)
new_bin += b"\0"*((-len(new_bin)) % 4)
encoded = json.dumps(doc, separators=(",", ":")).encode()
encoded += b" "*((-len(encoded)) % 4)
result = struct.pack("<III", 0x46546C67, 2, 28+len(encoded)+len(new_bin))
result += struct.pack("<II", len(encoded), 0x4E4F534A)+encoded
result += struct.pack("<II", len(new_bin), 0x004E4942)+new_bin
OUT.mkdir(parents=True, exist_ok=True)
DEST.write_bytes(result)
report = {
    "id": "wuming", "source": str(SOURCE.relative_to(ROOT)),
    "sourceSha256": hashlib.sha256(raw).hexdigest(),
    "model": str(DEST.relative_to(ROOT)), "modelSha256": hashlib.sha256(result).hexdigest(),
    "method": "Append lossless recolored uniform texture; retain every original bufferView byte. Gold cuff material only.",
    "changedPixels": int(changed.sum()), "geometrySkinBytesPreserved": True,
    "rights": "Derivative of the existing project-owned Lin athlete; inherits source provenance, no new third-party assets.",
    "externalCredits": 0,
    "rebuild": "python3 scripts/assets/hidden-master.py && python3 scripts/assets/portrait-cpu.py",
    "optionalBlendExport": "/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/assets/render-hidden-master.py",
}
(OUT / "provenance.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
print(json.dumps(report, ensure_ascii=False))
