"""Revision-3 anatomical calibration in glTF Y-up coordinates.

Source limb centre observations come from mesh cross-sections, not mocap.
Topology/UVs are untouched. Same continuous height map is used on vertices and
bind-joint translations; old sources remain available for comparison.
"""
import numpy as np

PROFILES = {
    'lin': {'centres': [[.592, .028], [.487, -.064], [.420, -.089], [.360, -.081], [.300, -.045]],
            'hand_scale': .88, 'radius_scale': .94},
    'mei': {'centres': [[.482, .058], [.371, -.013], [.315, -.024], [.258, -.034], [.242, -.035]],
            'hand_scale': .90, 'radius_scale': .97},
    'noah': {'centres': [[.550, .068], [.430, -.003], [.389, -.046], [.330, -.050], [.282, -.035]],
             'hand_scale': .86, 'radius_scale': .93},
}
LEVELS = np.array([.91, 1.11, 1.24, 1.36, 1.40])

def height_map(y):
    return np.interp(y, [0, .11, .48, .85, 1.40, 1.96, 3],
                     [0, .11, .535, .96, 1.40, 1.96, 3])

def calibrate_vertices(points, weights, indices, joints, name):
    profile = PROFILES[name]
    result = points.copy()
    result[:, 1] = height_map(points[:, 1])
    centres = np.array(profile['centres'])
    for side, sign in [('L', 1), ('R', -1)]:
        names = [f'{part}_{side}' for part in ['UpperArm', 'LowerArm', 'Hand']]
        arm = np.sum(weights*np.isin(indices, [joints.index(n) for n in names]), axis=1)
        # Smooth blend at the shoulder seam; full skin follows the calibrated
        # centreline where the mesh is already anatomically assigned to the arm.
        mix = np.clip((arm-.08)/.84, 0, 1)
        mix = mix*mix*(3-2*mix)
        y = points[:, 1]
        source = np.column_stack([sign*np.interp(y, LEVELS, centres[:, 0]),
                                  y, np.interp(y, LEVELS, centres[:, 1])])
        target_x = sign*np.interp(y, [.91, 1.11, 1.40], [.55, .44, .28])
        target_z = np.interp(y, [.91, 1.11, 1.40], [.025, 0, 0])
        target = np.column_stack([target_x, y, target_z])
        radial = points-source
        scale = profile['radius_scale']
        corrected = target+radial*np.array([scale, 1, scale])
        # Distal palm/fingers shrink together, not independently of the wrist.
        distal = y < .945
        wrist_source = np.array([sign*centres[0, 0], .91, centres[0, 1]])
        wrist_target = np.array([sign*.55, .91, .025])
        hand = wrist_target+(points-wrist_source)*profile['hand_scale']
        blend = np.clip((.945-y)/.035, 0, 1)
        blend = blend*blend*(3-2*blend)
        corrected = corrected*(1-blend[:, None])+hand*blend[:, None]
        # Arm calibration must not inherit the lower-body height stretch.
        result = result*(1-mix[:, None])+corrected*mix[:, None]
        # Remove residual bowed centreline in the upper-arm shaft. Fit section
        # midpoints rather than shrinking the whole arm to a cylinder: radii,
        # muscle asymmetry, skin topology and UV detail remain.
        shoulder = np.array([sign*.28, 1.40, 0.])
        elbow = np.array([sign*.44, 1.11, 0.])
        axis = elbow-shoulder
        along = ((result-shoulder)@axis)/(axis@axis)
        radial = result-(shoulder+along[:,None]*axis)
        knots = np.linspace(.15, .90, 8)
        offsets = []
        for u in knots:
            selected = (np.abs(along-u)<.09)&(arm>.9)
            if selected.sum() >= 4:
                section = radial[selected]
                offsets.append((np.percentile(section,10,axis=0)+np.percentile(section,90,axis=0))/2)
            else:
                offsets.append(np.zeros(3))
        offsets = np.array(offsets)
        correction = np.column_stack([np.interp(along, knots, offsets[:,k]) for k in range(3)])
        correction -= ((correction@axis)/(axis@axis))[:,None]*axis
        envelope = np.clip((along-.05)/.15,0,1)*np.clip((1.05-along)/.15,0,1)*mix
        result -= correction*envelope[:,None]*.85
    return result

def calibrate_weights(points, weights, indices, joints, joint_blend=.18):
    """Keep shoulder/torso transition; concentrate articulation at actual elbow."""
    result = weights.copy()
    output = indices.copy()
    for vi,p in enumerate(points):
        side = 'L' if p[0]>0 else 'R'
        names = ['UpperArm_'+side,'LowerArm_'+side,'Hand_'+side]
        ids = [joints.index(n) for n in names]
        total = sum(w for j,w in zip(indices[vi],weights[vi]) if j in ids)
        if total < .5:
            continue
        sign = 1 if side == 'L' else -1
        shoulder = np.array([sign*.28,1.40,0.])
        elbow_at = np.array([sign*.44,1.11,0.])
        wrist_at = np.array([sign*.55,.91,.025])
        upper_axis = elbow_at-shoulder
        lower_axis = wrist_at-elbow_at
        upper_u = (p-shoulder)@upper_axis/(upper_axis@upper_axis)
        lower_u = (p-elbow_at)@lower_axis/(lower_axis@lower_axis)
        # Blend only in the small zone around each pivot, measured along its
        # anatomical axis. A horizontal Y cutoff wrongly bends shaft vertices
        # on the lower side of a thick, oblique forearm.
        u = np.clip((upper_u-(1-joint_blend/2))/joint_blend,0,1); elbow = u*u*(3-2*u)
        v = np.clip((lower_u-(1-joint_blend/2))/joint_blend,0,1); wrist = v*v*(3-2*v)
        mapping = {int(j):float(w) for j,w in zip(indices[vi],weights[vi]) if j not in ids and w>0}
        mapping.update({ids[0]:total*(1-elbow),ids[1]:total*elbow*(1-wrist),ids[2]:total*elbow*wrist})
        items = sorted(mapping.items(),key=lambda x:-x[1])[:4]
        while len(items)<4: items.append((0,0.))
        norm = sum(w for _,w in items)
        output[vi] = [j for j,_ in items]
        result[vi] = [w/norm for _,w in items]
    return output,result

def calibrate_bind(doc, read, append):
    """Keep rotations and names; move bind joints using the same body map."""
    worlds = {}
    parents = {}
    def local(node):
        if 'matrix' in node:
            return np.array(node['matrix']).reshape(4, 4).T
        x,y,z,w = node.get('rotation', [0,0,0,1])
        rot = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
        m = np.eye(4)
        m[:3,:3] = rot @ np.diag(node.get('scale',[1,1,1]))
        m[:3,3] = node.get('translation',[0,0,0])
        return m
    def visit(i, parent):
        worlds[i] = parent @ local(doc['nodes'][i])
        for child in doc['nodes'][i].get('children',[]):
            parents[child] = i
            visit(child, worlds[i])
    for i in doc['scenes'][doc.get('scene',0)]['nodes']:
        visit(i, np.eye(4))
    skin = doc['skins'][0]
    adjusted = {i:m.copy() for i,m in worlds.items()}
    for i in skin['joints']:
        if not any(word in doc['nodes'][i]['name'] for word in ['Arm','Hand','Clavicle']):
            adjusted[i][1,3] = height_map(worlds[i][1,3])
    for i in skin['joints']:
        parent = adjusted[parents[i]] if i in parents else np.eye(4)
        m = np.linalg.inv(parent) @ adjusted[i]
        node = doc['nodes'][i]
        for key in ['translation','rotation','scale']:
            node.pop(key, None)
        node['matrix'] = m.T.reshape(-1).tolist()
    matrices = [np.linalg.inv(adjusted[i]).T.reshape(-1) for i in skin['joints']]
    skin['inverseBindMatrices'] = append(np.array(matrices), 'MAT4')
