"""Extend the approved fixed-joint adapter without resculpting seven athletes.
Preserve source geometry, UVs, normals, materials/images and bind joints.
Append only local anatomical weight refinements and activation metadata.
"""
from pathlib import Path
import sys, json, struct, hashlib, importlib.util
import numpy as np
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('calibration', Path(__file__).with_name('body-proportion-calibration.py'))
calibration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(calibration)
ROOT = Path(__file__).resolve().parents[2]
out = ROOT/'public/models/releases/joint-pivot-v1'
out.mkdir(parents=True, exist_ok=True)
profiles = dict.fromkeys(['rafa','sora','ines','leo','adrian','luca','wuming'], 'original')
reports = []
for name, profile in profiles.items():
    path = ROOT/f'public/models/characters/{name}.glb'
    raw = path.read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+n])
    original = raw[28+n:28+n+doc['buffers'][0]['byteLength']]
    binary = bytearray(original)
    types = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
    dtypes = {5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
    def read(i):
        a = doc['accessors'][i]
        v = doc['bufferViews'][a['bufferView']]
        dtype = np.dtype(dtypes[a['componentType']])
        width = types[a['type']]
        return np.ndarray((a['count'],width),dtype,buffer=binary,
            offset=v.get('byteOffset',0)+a.get('byteOffset',0),
            strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
    def append(data, component):
        data = np.asarray(data,dtype=dtypes[component])
        binary.extend(b'\0'*((-len(binary))%4))
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':data.nbytes})
        binary.extend(data.tobytes())
        accessor = len(doc['accessors'])
        doc['accessors'].append({'bufferView':view,'componentType':component,'count':len(data),'type':'VEC4'})
        return accessor
    if len(doc['skins']) != 1 or len(doc['skins'][0]['joints']) != 21:
        raise ValueError(f'{name}: expected existing 21-joint skin')
    joints = [doc['nodes'][i]['name'] for i in doc['skins'][0]['joints']]
    changed = 0
    for mesh in doc['meshes']:
        # Rigid cloth accessory remains exactly on its original forearm bone.
        if 'sweatband' in mesh.get('name',''):
            continue
        for primitive in mesh['primitives']:
            attrs = primitive['attributes']
            if 'JOINTS_0' not in attrs:
                continue
            points, indices, weights = read(attrs['POSITION']),read(attrs['JOINTS_0']),read(attrs['WEIGHTS_0'])
            # Original (unrecentered) meshes have thicker/off-axis joint seams
            # than the three calibrated prototypes. A 12cm elbow / 8cm wrist
            # transition keeps the shafts rigid without a sharp weight cliff.
            new_indices,new_weights = calibration.calibrate_weights(points,weights,indices,joints,joint_blend=.36)
            # Retire tiny residual arm influences at the edge of the blend
            # band; even 0.9% upper-arm weight visibly drags Luca's forearm
            # shaft in an isolated elbow sweep. Keep non-arm weights intact.
            arm_ids=[i for i,j in enumerate(joints) if 'Arm_' in j or 'Hand_' in j]
            arm_mask=np.isin(new_indices,arm_ids)
            arm_total=np.sum(new_weights*arm_mask,axis=1,keepdims=True)
            trimmed=np.maximum(new_weights-.015*arm_total,0)*arm_mask
            trimmed_sum=trimmed.sum(axis=1,keepdims=True)
            trimmed*=np.divide(arm_total,trimmed_sum,out=np.zeros_like(arm_total),where=trimmed_sum>0)
            new_weights=np.where(arm_mask,trimmed,new_weights)
            changed += int(np.sum(np.any(new_indices!=indices,axis=1)|np.any(np.abs(new_weights-weights)>1e-7,axis=1)))
            attrs['JOINTS_0']=append(new_indices,5123)
            attrs['WEIGHTS_0']=append(new_weights,5126)
    doc['scenes'][doc.get('scene',0)].setdefault('extras',{}).update(
        jointOptimizationRevision=1,jointHandProfile=profile,
        jointOptimizationScope='fixed wrist pivot and localized elbow/wrist weights; appearance preserved')
    assert binary[:len(original)] == original
    doc['buffers'][0]['byteLength']=len(binary)
    text=json.dumps(doc,separators=(',',':')).encode()
    text+=b' '*((-len(text))%4);binary.extend(b'\0'*((-len(binary))%4))
    result=struct.pack('<III',0x46546c67,2,28+len(text)+len(binary))
    result+=struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary
    target=out/f'{name}.glb'
    target.write_bytes(result)
    reports.append({'id':name,'source':str(path.relative_to(ROOT)),'output':str(target.relative_to(ROOT)),
        'sourceSha256':hashlib.sha256(raw).hexdigest(),'outputSha256':hashlib.sha256(result).hexdigest(),
        'changedWeightVertices':changed,'appearancePayloadPreserved':True,'jointProfile':profile,
        'elbowToWrist':.256,'upperArm':.36,'externalCredits':0})
    print(name, 'weights updated:', changed)
(ROOT/'assets/characters/roster-joint-release.json').write_text(json.dumps(reports,indent=2)+'\n')
