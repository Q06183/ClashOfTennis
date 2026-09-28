"""Software-render the actual Wuming GLB: no GPU, browser, network or Blender.

Retains the shipped model as the editable source; optional .blend export is in
render-hidden-master.py. Camera matches the existing roster portrait framing.
"""
import hashlib
import io
import json
import pathlib
import struct
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
path = ROOT / "public/models/characters/wuming.glb"
raw = path.read_bytes()
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


def normalized(vector):
    return vector/np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), 1e-8)


W, H = 512, 640
camera = np.array([1., 2.5, 4.])
target = np.array([0., 1.4, 0.])
forward = normalized(target-camera)
right = normalized(np.cross(forward, [0, 1, 0]))
up = np.cross(right, forward)
rgba = np.zeros((H, W, 4), dtype=np.float64)
depth = np.full((H, W), np.inf)
lights = [(np.array([2., 5., 3.]), .55), (np.array([-3., 3., 1.]), .30)]
for mesh in doc["meshes"]:
    for primitive in mesh["primitives"]:
        attrs = primitive["attributes"]
        positions = accessor(attrs["POSITION"])
        normals = accessor(attrs["NORMAL"])
        uv = accessor(attrs["TEXCOORD_0"]) if "TEXCOORD_0" in attrs else None
        material = doc["materials"][primitive["material"]]["pbrMetallicRoughness"]
        texture = None
        if "baseColorTexture" in material:
            image = doc["images"][doc["textures"][material["baseColorTexture"]["index"]]["source"]]
            v = doc["bufferViews"][image["bufferView"]]
            texture = np.asarray(Image.open(io.BytesIO(binary[v["byteOffset"]:v["byteOffset"]+v["byteLength"]])).convert("RGB"))/255.
        color = np.array(material.get("baseColorFactor", [1, 1, 1, 1])[:3])
        relative = positions-target
        screen = np.column_stack((W/2+(relative@right)*H/1.5, H/2-(relative@up)*H/1.5))
        distances = (positions-camera)@forward
        for indices in accessor(primitive["indices"]).reshape(-1, 3):
            tri = screen[indices]
            lo = np.maximum(0, np.floor(tri.min(axis=0)).astype(int))
            hi = np.minimum([W-1, H-1], np.ceil(tri.max(axis=0)).astype(int))
            if np.any(hi < lo):
                continue
            xx, yy = np.meshgrid(np.arange(lo[0], hi[0]+1), np.arange(lo[1], hi[1]+1))
            v0, v1 = tri[1]-tri[0], tri[2]-tri[0]
            den = v0[0]*v1[1]-v0[1]*v1[0]
            if abs(den) < 1e-8:
                continue
            dx, dy = xx+.5-tri[0, 0], yy+.5-tri[0, 1]
            b, c = (dx*v1[1]-dy*v1[0])/den, (v0[0]*dy-v0[1]*dx)/den
            a = 1-b-c
            bary = np.stack((a, b, c), axis=-1)
            z = bary@distances[indices]
            visible = (a >= 0) & (b >= 0) & (c >= 0) & (z < depth[yy, xx])
            if not visible.any():
                continue
            normal = normalized(bary@normals[indices])
            pos = bary@positions[indices]
            brightness = np.full(z.shape, .58)
            for light, strength in lights:
                brightness += strength*np.maximum(0, np.sum(normal*normalized(light-pos), axis=-1))
            if texture is not None:
                coords = bary@uv[indices]
                tx = np.clip((coords[..., 0]*texture.shape[1]).astype(int), 0, texture.shape[1]-1)
                ty = np.clip((coords[..., 1]*texture.shape[0]).astype(int), 0, texture.shape[0]-1)
                rgb = texture[ty, tx]*color
                linear = np.where(rgb <= .04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)
            else:
                linear = np.broadcast_to(color, (*z.shape, 3))
            lit = np.clip(linear*brightness[..., None], 0, 1)
            encoded = np.where(lit <= .0031308, lit*12.92, 1.055*lit**(1/2.4)-.055)
            rgba[yy[visible], xx[visible], :3] = encoded[visible]
            rgba[yy[visible], xx[visible], 3] = 1
            depth[yy[visible], xx[visible]] = z[visible]

portrait = ROOT / "public/portraits/wuming.png"
Image.fromarray(np.round(rgba*255).astype(np.uint8)).resize((256, 320), Image.Resampling.LANCZOS).save(portrait)
report_path = ROOT / "assets/characters/wuming/provenance.json"
report = json.loads(report_path.read_text())
report.update({
    "portrait": str(portrait.relative_to(ROOT)),
    "portraitSha256": hashlib.sha256(portrait.read_bytes()).hexdigest(),
    "portraitRenderer": "Local CPU rasterizer; actual shipped GLB texture and geometry, 2x supersampling.",
    "editable": str(path.relative_to(ROOT)),
    "editableFormat": "GLB (importable into Blender); optional .blend export blocked by host GPU/approval environment.",
})
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
print(json.dumps({"portrait": str(portrait), "visiblePixels": int((rgba[..., 3] > 0).sum())}))
