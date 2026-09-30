"""Save editable 21-bone source siblings without touching existing .blend files.
Blender --background --python scripts/assets/save-control-rigs.py
Runtime GLBs remain the byte-preserving migration output, not a Blender re-export.
"""
import bpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
for name in ['lin', 'mei', 'rafa', 'sora', 'ines', 'leo', 'noah', 'adrian', 'luca', 'wuming']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = ROOT / 'public/models' / ('athlete.glb' if name == 'lin' else f'characters/{name}.glb')
    bpy.ops.import_scene.gltf(filepath=str(source))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    assert len(rig.data.bones) == 21, (name, len(rig.data.bones))
    rig['rig_schema'] = 'tennis-21-v1'
    rig['motion_note'] = 'Deformation source only. Runtime animation is procedural TypeScript with fixed-length IK.'
    folder = ROOT / ('assets/athlete/rigged' if name == 'lin' else f'assets/characters/{name}')
    folder.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'athlete-control-rig.blend'))
    print(f'CONTROL_RIG_SAVED {name}')
