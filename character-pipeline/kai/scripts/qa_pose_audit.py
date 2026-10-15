"""Quantitative pose audit: express every key pose in BODY-RELATIVE anatomical terms and compare to
pro serve norms (Kovacs & Ellenbecker 2011; Fleisig 2003; Reid 2008).  World axes: net = -Y, up = +Z.
Prints, per sampled frame:
  chest_yaw   : where the chest faces (0 = net, -90 = facing right sideline [side-on for right-hander])
  pelvis_yaw  : same for the pelvis;  sep = chest - pelvis (hip-shoulder separation)
  shoulder_tilt: shoulder line angle vs horizontal (+ = right shoulder higher)
  trunk_lean  : trunk axis vs vertical, forward(+)/back(-) in the net direction; side lean toward left(+)
  R abduction : right upper-arm angle from the trunk's down axis (0 = arm hanging, 90 = horizontal, 180 = overhead)
  R elbow flex, L abduction, L elbow
  racket tip height, ball height, head height
  hand-shoulder distance (detect arm crossing / reaching weirdly)"""
import bpy, os, sys, json, math
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, world_head, world_tail
src = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "kai_05_serve.blend"
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, src))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; ball = bpy.data.objects["Kai_Ball"]
sc = bpy.context.scene
U = Vector((0, 0, 1)); NET = Vector((0, -1, 0))
def yaw_of(v):  # angle of horizontal vector v measured from the net direction, + = counter-clockwise (toward left/+X)
    h = Vector((v.x, v.y, 0)).normalized(); a = math.degrees(math.atan2(h.cross(NET).z * -1, h.dot(NET)))
    return a
def ang(a, b): return math.degrees(a.angle(b))
rows = []
frames = sorted(set(list(range(1, 141, 4)) + [36, 58, 70, 72, 75, 78, 81, 87, 94]))
for f in frames:
    sc.frame_set(f)
    shL, shR = world_head(rig, "upperarm_l"), world_head(rig, "upperarm_r")
    hipL, hipR = world_head(rig, "thigh_l"), world_head(rig, "thigh_r")
    neck, pel = world_head(rig, "neck_01"), world_head(rig, "pelvis")
    up_t = (neck - pel).normalized()
    # chest forward = up x (left-right) ; character's left = +X at rest, right-to-left vector:
    sh_line = (shL - shR); hip_line = (hipL - hipR)
    chest_fwd = sh_line.cross(up_t).normalized() * -1
    pel_fwd = hip_line.cross(U).normalized() * -1
    chest_yaw, pel_yaw = yaw_of(chest_fwd), yaw_of(pel_fwd)
    tilt = math.degrees(math.atan2((shR - shL).z, Vector(((shR - shL).x, (shR - shL).y, 0)).length))
    lean_fwd = math.degrees(math.atan2(up_t.dot(NET), up_t.z))
    elR = world_head(rig, "lowerarm_r"); wrR = world_tail(rig, "lowerarm_r")
    elL = world_head(rig, "lowerarm_l"); wrL = world_tail(rig, "lowerarm_l")
    abdR = ang(elR - shR, -up_t); abdL = ang(elL - shL, -up_t)
    flexR = ang(elR - shR, wrR - elR); flexL = ang(elL - shL, wrL - elL)
    # arm plane: is the right upper arm in front of / behind the shoulder line (horizontal adduction)?
    hadd = math.degrees(math.atan2((elR - shR).dot(chest_fwd), (elR - shR).dot(-sh_line.normalized())))
    tip = racket.matrix_world @ Vector((0, 0.68, 0)); head = world_tail(rig, "head")
    knL = math.degrees((world_tail(rig, "thigh_l") - hipL).angle(world_tail(rig, "calf_l") - world_tail(rig, "thigh_l")))
    rows.append(dict(f=f, chest=round(chest_yaw), pelvis=round(pel_yaw), sep=round(chest_yaw - pel_yaw), tilt=round(tilt), lean=round(lean_fwd),
                     abdR=round(abdR), flexR=round(flexR), haddR=round(hadd), abdL=round(abdL), flexL=round(flexL),
                     tipZ=round(tip.z, 2), ballZ=round(ball.matrix_world.translation.z, 2), headZ=round(head.z, 2),
                     wrR_rel=[round(x, 2) for x in (wrR - shR)], kneeL=round(knL)))
hdr = ["f", "chest", "pelvis", "sep", "tilt", "lean", "abdR", "flexR", "haddR", "abdL", "flexL", "tipZ", "ballZ", "headZ", "kneeL", "wrR_rel"]
print("AUDIT " + " ".join(f"{h:>7s}" for h in hdr))
for r in rows:
    print("AUDIT " + " ".join(f"{str(r[h]):>7s}" for h in hdr))
json.dump(rows, open(os.path.join(ROOT, "qa", "pose_audit.json"), "w"), indent=0)
