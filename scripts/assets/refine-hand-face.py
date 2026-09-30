"""Three reversible local prototypes; keep original 21-joint GLBs untouched.
Run using Python with numpy/Pillow. No network or generation credits.
"""
from pathlib import Path
import json, struct, io, hashlib
import numpy as np
from PIL import Image, ImageFilter
import importlib.util
import sys

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('body_calibration', Path(__file__).with_name('body-proportion-calibration.py'))
calibration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(calibration)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/prototypes'
OUT.mkdir(parents=True, exist_ok=True)
reports = []

def smooth(a, b, x):
    u = np.clip((x-a)/(b-a), 0, 1)
    return u*u*(3-2*u)

for name in ['lin', 'mei', 'noah']:
    source = ROOT / 'public/models' / ('athlete.glb' if name == 'lin' else f'characters/{name}.glb')
    raw = source.read_bytes()
    jl = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+jl])
    binary = bytearray(raw[28+jl:28+jl+doc['buffers'][0]['byteLength']])
    sizes = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    dtypes = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}

    def read(index):
        a = doc['accessors'][index]; v = doc['bufferViews'][a['bufferView']]
        count, n = a['count'], sizes[a['type']]
        dtype = np.dtype(dtypes[a['componentType']])
        return np.ndarray((count, n), dtype=dtype, buffer=binary,
            offset=v.get('byteOffset', 0)+a.get('byteOffset', 0),
            strides=(v.get('byteStride', n*dtype.itemsize), dtype.itemsize)).copy()

    def append_bytes(data):
        binary.extend(b'\0' * ((-len(binary)) % 4))
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)})
        binary.extend(data)
        return view

    def append(data, kind, component=5126):
        data = np.asarray(data, dtype=dtypes[component])
        idx = len(doc['accessors'])
        a = {'bufferView': append_bytes(data.tobytes()), 'componentType': component,
             'count': len(data), 'type': kind}
        if kind == 'VEC3':
            a.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        doc['accessors'].append(a)
        return idx

    joints = [doc['nodes'][n]['name'] for n in doc['skins'][0]['joints']]
    changed = removed = 0
    for mesh in doc['meshes']:
        for prim in mesh['primitives']:
            attr = prim['attributes']
            p = read(attr['POSITION']).astype(float)
            old = p.copy()
            idx = read(prim['indices']).reshape(-1, 3)
            weights = read(attr['WEIGHTS_0']); si = read(attr['JOINTS_0'])
            # Preserve the complete source skin, including every arm/hand face,
            # UV and anatomical weight. Never cut a sleeve to hide a prop seam.
            keep = np.ones(len(idx), dtype=bool)

            # Smooth geometric cheek/jaw volumes, preserving hair and identity.
            x, y, z = old.T
            if 'sweatband' in mesh.get('name', ''):
                a = np.array([-.44, 1.11, 0.])
                axis = np.array([-.11, -.20, .025])
                axis /= np.linalg.norm(axis)
                centre = np.array([-.44, 1.11, 0.]) + np.array([-.11, -.20, .025])*.84
                radial = old-centre-((old-centre)@axis)[:, None]*axis
                # Source cuff was centred on the nominal bone, whereas the
                # generated wrist surface sits ~4cm off that axis.
                p -= radial*.12
                p += np.array([-.045, 0., .007])
            front = smooth(.00, .10, z)
            head = smooth(1.60, 1.69, y)
            jaw = np.exp(-((y-(1.66 if name == 'mei' else 1.69))/.052)**2)*front
            cheeks = np.exp(-((y-(1.715 if name == 'mei' else 1.755))/.055)**2)*front
            p[:, 0] *= 1 + (.065 if name == 'mei' else .13)*head - .035*jaw
            p[:, 2] += .007*cheeks
            p[:, 1] = np.where(y > 1.61, 1.61+(y-1.61)*1.025, y)
            # Enlarge each eye region coherently (texture follows vertices).
            eye_y = 1.739 if name == 'mei' else 1.797
            for sign in [-1, 1]:
                cx = sign*(.052 if name == 'mei' else .047)
                mask = np.exp(-((x-cx)/.033)**2-((y-eye_y)/.024)**2)*front
                p[:, 0] += (x-cx)*mask*.16
                p[:, 1] += (y-eye_y)*mask*.26
            # Subtle expression and softened chin, not a fabricated rigged smile.
            mouth_y = 1.656 if name == 'mei' else 1.709
            corners = np.exp(-((np.abs(x)-.025)/.020)**2-((y-mouth_y)/.017)**2)*front
            p[:, 1] += .0035*corners

            # Smooth face topology with welded neighbors, preserving hairline,
            # mouth and nose silhouette. Three gentle passes remove cheek facets.
            _, weld_ids = np.unique(np.round(old, 5), axis=0, return_inverse=True)
            neighbors = [set() for _ in range(weld_ids.max()+1)]
            for tri in idx:
                for k in range(3):
                    neighbors[weld_ids[tri[k]]].update([weld_ids[tri[(k+1)%3]], weld_ids[tri[(k+2)%3]]])
            face_region = head*front*(1-smooth(1.83, 1.91, y))
            if 'sweatband' not in mesh.get('name', ''):
                arm_region = smooth(.32, .44, np.abs(x))*smooth(.91,1.0,y)*(1-smooth(1.25,1.40,y))
                face_region = np.maximum(face_region, arm_region*.7)
            for _ in range(3):
                prior = p.copy()
                centres = np.zeros((len(neighbors), 3))
                np.add.at(centres, weld_ids, prior)
                centres /= np.bincount(weld_ids)[:, None]
                for vi in np.flatnonzero(face_region > .02):
                    group = weld_ids[vi]
                    if neighbors[group]:
                        delta = centres[list(neighbors[group])].mean(axis=0)-prior[vi]
                        p[vi] += delta*.22*face_region[vi]

            # Even limb taper and reduced angular elbow bulb; no length change.
            for sign in [-1, 1]:
                a = np.array([sign*.44, 1.11, 0.0])
                b = np.array([sign*.55, .91, .025])
                axis = b-a; u = ((old-a) @ axis)/(axis@axis)
                radial = old-(a+np.clip(u, 0, 1)[:, None]*axis)
                arm_mask = smooth(.30, .40, x*sign)*(1-smooth(1.24, 1.40, y))
                taper = .08*smooth(.25, .95, u)*arm_mask
                p -= radial*taper[:, None]
            p = calibration.calibrate_vertices(p, weights, si, joints, name)
            calibrated_indices,calibrated_weights = calibration.calibrate_weights(p, weights, si, joints)
            attr['JOINTS_0'] = append(calibrated_indices, 'VEC4', 5123)
            attr['WEIGHTS_0'] = append(calibrated_weights, 'VEC4')
            changed += int(np.sum(np.linalg.norm(p-old, axis=1) > 1e-7))
            attr['POSITION'] = append(p, 'VEC3')

            # Area-weighted welded normals remove hard triangle lighting while
            # preserving texture/UV splits and all surviving geometry.
            faces = idx[keep]
            face_n = np.cross(p[faces[:, 1]]-p[faces[:, 0]], p[faces[:, 2]]-p[faces[:, 0]])
            normals = np.zeros_like(p)
            for k in range(3): np.add.at(normals, faces[:, k], face_n)
            _, inverse = np.unique(np.round(p, 5), axis=0, return_inverse=True)
            welded = np.zeros((inverse.max()+1, 3))
            np.add.at(welded, inverse, normals)
            normals = welded[inverse]
            normals /= np.maximum(1e-8, np.linalg.norm(normals, axis=1))[:, None]
            attr['NORMAL'] = append(normals, 'VEC3')

            mat = doc['materials'][prim['material']]['pbrMetallicRoughness']
            if 'baseColorTexture' not in mat: continue
            image_index = doc['textures'][mat['baseColorTexture']['index']]['source']
            image = doc['images'][image_index]; view = doc['bufferViews'][image['bufferView']]
            im = Image.open(io.BytesIO(binary[view['byteOffset']:view['byteOffset']+view['byteLength']])).convert('RGB')
            rgb = np.asarray(im).astype(float)/255
            h, w = rgb.shape[:2]; uv = read(attr['TEXCOORD_0'])
            mask = np.zeros((h, w))
            # Rasterize position-based masks into UV space, not whole-face paint.
            for tri in idx:
                if old[tri, 1].max() < .92: continue
                tex = uv[tri]*[w, h]-.5
                lo = np.maximum(0, np.floor(tex.min(axis=0)).astype(int))
                hi = np.minimum([w-1, h-1], np.ceil(tex.max(axis=0)).astype(int))
                if np.any(hi < lo): continue
                xx, yy = np.meshgrid(np.arange(lo[0], hi[0]+1), np.arange(lo[1], hi[1]+1))
                v0, v1 = tex[1]-tex[0], tex[2]-tex[0]
                den = v0[0]*v1[1]-v0[1]*v1[0]
                if abs(den) < 1e-8: continue
                dx, dy = xx-tex[0, 0], yy-tex[0, 1]
                b = (dx*v1[1]-dy*v1[0])/den; c = (v0[0]*dy-v0[1]*dx)/den; a = 1-b-c
                pos = a[..., None]*old[tri[0]]+b[..., None]*old[tri[1]]+c[..., None]*old[tri[2]]
                value = smooth(1.59, 1.66, pos[..., 1])*(1-smooth(1.85, 1.93, pos[..., 1]))
                value *= smooth(-.02, .07, pos[..., 2])*(a >= 0)*(b >= 0)*(c >= 0)
                mask[yy, xx] = np.maximum(mask[yy, xx], value)
            # Keep eyes, brows, lips and hair. Lift low-frequency baked facial
            # shadows only on skin-color pixels; do not bleach skin tone.
            skin = smooth(.025, .07, rgb[..., 0]-rgb[..., 2])*smooth(.15, .30, rgb[..., 0])
            skin *= 1-smooth(.12, .23, rgb[..., 0]-rgb[..., 1])*.35
            strength = mask*skin
            blurred = np.asarray(im.filter(ImageFilter.GaussianBlur(2))).astype(float)/255
            target = .65*rgb+.35*blurred
            target = np.clip(target*.86+.095, 0, 1)
            result = rgb*(1-strength[..., None]) + target*strength[..., None]
            # Keep skin texture unchanged on the wrist. The ill-fitting
            # separate ring is omitted rather than painted across the palm.
            # Preserve authored eye/iris details; painting an idealised eye onto
            # this fragmented low-resolution UV atlas produces a sticker look.
            buf = io.BytesIO();Image.fromarray(np.uint8(result*255+.5)).save(buf, format='PNG')
            image['bufferView'] = append_bytes(buf.getvalue());image['mimeType'] = 'image/png'
            # Skin is dielectric and matte. Keep body color texture, replace
            # harsh packed specular response, not the scene lighting.
            mat['metallicFactor'] = 0
            mat['roughnessFactor'] = .82
            mat.pop('metallicRoughnessTexture', None)

    calibration.calibrate_bind(doc, read, append)
    scene = doc['scenes'][doc.get('scene', 0)]
    for node in doc['nodes']:
        if 'sweatband' in node.get('name', ''):
            node.pop('mesh', None);node.pop('skin', None)
    scene.setdefault('extras', {}).update(handFaceRevision=2, handFaceCharacter=name)
    scene['extras']['bodyProportionRevision'] = 3
    scene['extras']['proportions'] = {'hipHeight': .96, 'legLength': .425, 'upperArm': .33, 'elbowToGrip': .34,
                                    'handScale': calibration.PROFILES[name]['hand_scale']}
    # GLTFLoader copies scene extras to scene.userData.
    doc['buffers'][0]['byteLength'] = len(binary)
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' '*((-len(text)) % 4); binary.extend(b'\0'*((-len(binary)) % 4))
    result = struct.pack('<III', 0x46546C67, 2, 28+len(text)+len(binary))
    result += struct.pack('<II', len(text), 0x4E4F534A)+text+struct.pack('<II', len(binary), 0x004E4942)+binary
    dest = OUT/f'{name}.glb';dest.write_bytes(result)
    reports.append({'id': name, 'source': str(source.relative_to(ROOT)), 'output': str(dest.relative_to(ROOT)),
        'sourceSha256': hashlib.sha256(raw).hexdigest(), 'outputSha256': hashlib.sha256(result).hexdigest(),
        'sculptedVertices': changed, 'replacedHandTriangles': removed, 'externalCredits': 0,
        'bodyProportionRevision': 3, 'proportions': scene['extras']['proportions'],
        'notes': 'Original topology/UV retained; source arm axis and anatomical weights calibrated; prototype only.'})
    print(name, changed, removed)

(ROOT/'assets/characters/hand-face-prototypes.json').write_text(json.dumps(reports, indent=2)+'\n')
