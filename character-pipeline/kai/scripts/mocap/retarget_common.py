import math, os
from mathutils import Vector, Matrix
from bvh_tools import parse_bvh, fk, DATA
SRC = "jarua_Servicio.bvh"; C_SRC = 1113; PRE, POST = 1.55, 0.95       # seconds before / after contact
FPS = 60; G = 9.81
J, F, dt = parse_bvh(os.path.join(DATA, SRC))
f0, f1 = C_SRC - int(PRE / dt), C_SRC + int(POST / dt)
SRCW = [fk(J, F[i]) for i in range(f0, f1 + 1)]
def V(p): return Vector((p[0], p[1], p[2]))
# ---------- source coordinate frame -> Blender world:  BVH Y-up cm  ->  Z-up m, serve direction -> -Y
hip_start, hip_end = V(SRCW[0]["Hips"][0]), V(SRCW[-1]["Hips"][0])
travel = hip_end - hip_start; travel.y = 0
fwd_src = travel.normalized()                    # into the court (horizontal, in BVH x/z plane)
# BVH: x, y(up), z.  Build rotation taking fwd_src -> Blender -Y and BVH up(Y) -> Blender +Z
up_src = Vector((0, 1, 0)); side_src = fwd_src.cross(up_src).normalized()   # = server's right? check below
M_src = Matrix((side_src, up_src, fwd_src)).transposed()                   # columns
M_dst = Matrix((Vector((1, 0, 0)) * -1, Vector((0, 0, 1)), Vector((0, -1, 0)))).transposed()
R_SD = M_dst @ M_src.inverted()                                              # maps BVH dir -> Blender dir
def to_bl(p, origin):
    return R_SD @ ((V(p) - origin) * 0.01)
# handedness sanity: source right shoulder should map to the server's right (-X in Blender when facing -Y)
w0 = SRCW[int(PRE / dt)]
rs = to_bl(w0["RightShoulder"][0], V(w0["Hips"][0])); ls = to_bl(w0["LeftShoulder"][0], V(w0["Hips"][0]))
print("CHECK at contact: right shoulder", tuple(round(x, 2) for x in rs), "left", tuple(round(x, 2) for x in ls))
if (rs - ls).x > 0:     # mirrored -> flip the side axis
    M_dst = Matrix((Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)))).transposed()
    R_SD = M_dst @ M_src.inverted()
    print("   side axis flipped to keep right-handedness")
if R_SD.determinant() < 0:
    print("WARNING: reflection in R_SD, determinant", R_SD.determinant())


FPS = 60
MAP = [
    ("pelvis", "Hips", "Chest"),
    ("spine_01", "Hips", "Chest"), ("spine_02", "Hips", "Chest"), ("spine_03", "Chest", "Neck"),
    ("neck_01", "Neck", "Head"), ("head", "Head", "Head_End"),
    ("clavicle_l", "LeftCollar", "LeftShoulder"), ("upperarm_l", "LeftShoulder", "LeftElbow"),
    ("lowerarm_l", "LeftElbow", "LeftWrist"), ("hand_l", "LeftWrist", "LeftWrist_End"),
    ("clavicle_r", "RightCollar", "RightShoulder"), ("upperarm_r", "RightShoulder", "RightElbow"),
    ("lowerarm_r", "RightElbow", "RightWrist"), ("hand_r", "RightWrist", "RightWrist_End"),
    ("thigh_l", "LeftHip", "LeftKnee"), ("calf_l", "LeftKnee", "LeftAnkle"), ("foot_l", "LeftAnkle", "LeftAnkle_End"),
    ("thigh_r", "RightHip", "RightKnee"), ("calf_r", "RightKnee", "RightAnkle"), ("foot_r", "RightAnkle", "RightAnkle_End"),
]
origin = V(SRCW[0]["Hips"][0]); origin.y = 0.0
C_FRAME = 1 + int(round(PRE * FPS))
def sample(t):
    x = t / dt; i = max(0, min(len(SRCW) - 2, int(math.floor(x)))); u = x - i
    a, b = SRCW[i], SRCW[i + 1]
    return {k: ([a[k][0][j] * (1 - u) + b[k][0][j] * u for j in range(3)], None) for k in a}
