"""Parse Tennis-MoCap serve BVHs (CC BY-SA 3.0, Pulgarin-Giraldo et al. 2017), compute world joint positions,
segment individual serves by right/left wrist height peaks, and report handedness + per-serve timing.
Pure python (no numpy)."""
import math, sys, os, json, re
DATA = "/tmp/tennis-mocap/data"

def parse_bvh(path):
    txt = open(path, encoding="latin-1").read()
    head, motion = txt.split("MOTION", 1)
    joints = []; stack = []; cur = None
    toks = head.replace("{", " { ").replace("}", " } ").split()
    i = 0
    while i < len(toks):
        t = toks[i]
        if t in ("ROOT", "JOINT"):
            name = toks[i + 1]; j = {"name": name, "parent": stack[-1] if stack else None, "offset": None, "channels": [], "end": None}
            joints.append(j); cur = j; i += 2; continue
        if t == "End":
            cur = {"name": (stack[-1] if stack else "x") + "_End", "parent": stack[-1], "offset": None, "channels": [], "end": True}
            joints.append(cur); i += 2; continue
        if t == "{": stack.append(cur["name"]); i += 1; continue
        if t == "}": stack.pop(); i += 1; continue
        if t == "OFFSET": cur["offset"] = [float(x) for x in toks[i + 1:i + 4]]; i += 4; continue
        if t == "CHANNELS":
            n = int(toks[i + 1]); cur["channels"] = toks[i + 2:i + 2 + n]; i += 2 + n; continue
        i += 1
    lines = motion.strip().splitlines()
    nfr = int(lines[0].split()[-1]); dt = float(lines[1].split()[-1])
    frames = [[float(x) for x in l.split()] for l in lines[2:2 + nfr]]
    return joints, frames, dt

def rotm(axis, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    if axis == "X": return [[1, 0, 0], [0, c, -s], [0, s, c]]
    if axis == "Y": return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]]
def mm(a, b): return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
def mv(a, v): return [sum(a[i][k] * v[k] for k in range(3)) for i in range(3)]
def add(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

def fk(joints, frame):
    """returns dict name -> (world_pos, world_rot)"""
    out = {}; ci = 0
    for j in joints:
        pos = [0, 0, 0]; R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        for ch in j["channels"]:
            v = frame[ci]; ci += 1
            if ch.endswith("position"): pos["XYZ".index(ch[0])] = v
            else: R = mm(R, rotm(ch[0], v))
        if j["parent"] is None:
            wp = add(j["offset"], pos); wr = R
        else:
            pp, pr = out[j["parent"]]
            wp = add(pp, mv(pr, j["offset"])); wr = mm(pr, R)
        out[j["name"]] = (wp, wr)
    return out

if __name__ == "__main__":
    files = sys.argv[1:] or sorted(f for f in os.listdir(DATA) if f.endswith(".bvh"))
    summary = {}
    for fn in files:
        joints, frames, dt = parse_bvh(os.path.join(DATA, fn))
        names = [j["name"] for j in joints]
        W = [fk(joints, fr) for fr in frames]
        hip_y = [w["Hips"][0][1] for w in W]
        rw = [w["RightWrist"][0][1] for w in W]; lw = [w["LeftWrist"][0][1] for w in W]
        head = [w["Head"][0][1] for w in W]
        # serve contact ~ hitting-hand wrist max height. Find peaks separated by >= 1.2 s, above head + 25 cm
        def peaks(sig, minsep):
            pk = []
            for i in range(1, len(sig) - 1):
                if sig[i] >= sig[i - 1] and sig[i] > sig[i + 1] and sig[i] > head[i] + 25:
                    if pk and i - pk[-1] < minsep:
                        if sig[i] > sig[pk[-1]]: pk[-1] = i
                    else: pk.append(i)
            return pk
        pr, pl = peaks(rw, int(1.2 / dt)), peaks(lw, int(1.2 / dt))
        # tossing arm also peaks high; the hitting wrist peak is the HIGHER one and comes later
        mr = sum(rw[i] for i in pr) / max(1, len(pr)); ml = sum(lw[i] for i in pl) / max(1, len(pl))
        # wrist speed at peak region: hitting hand much faster
        def maxspeed(w_key):
            best = 0
            for i in range(1, len(W)):
                a, b = W[i - 1][w_key][0], W[i][w_key][0]
                best = max(best, math.dist(a, b) / dt)
            return best
        vr, vl = maxspeed("RightWrist"), maxspeed("LeftWrist")
        summary[fn] = dict(frames=len(frames), dt=dt, hips_mean_y=round(sum(hip_y) / len(hip_y), 1), head_max=round(max(head), 1),
                           right_peaks=len(pr), left_peaks=len(pl), right_peak_h=round(mr, 1), left_peak_h=round(ml, 1),
                           vmax_right_cm_s=round(vr), vmax_left_cm_s=round(vl), joints=names[:5])
        print(fn, json.dumps(summary[fn]))
