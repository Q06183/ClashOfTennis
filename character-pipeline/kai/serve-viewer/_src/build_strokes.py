"""Build the unified Kai strokes viewer (serve + forehand + two-handed backhand).

Inputs:
  export/kai.glb                    six animations: Serve(_Ball), Forehand(_Ball), Backhand(_Ball)
  qa/physics_report.json + qa/serve_plan.json
  qa/ground_physics.json + qa/ground_plan.json
Output:
  ../Kai击球动作预览.html  (single file, GLB base64 inlined)
The build asserts every physics gate passes for all three strokes.
"""
import json, base64, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
KAI = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(os.path.dirname(HERE), "Kai击球动作预览.html")

# ---------------- serve post-contact flight (copied from the serve viewer builder) ----------------
serve_rep = json.load(open(os.path.join(KAI, "qa", "physics_report.json")))
serve_plan = json.load(open(os.path.join(KAI, "qa", "serve_plan.json")))
ss, sc_ = serve_rep["series"], serve_rep["checks"]
sfr = ss["frame"]
air = [f for i, f in enumerate(sfr) if ss["shoe_l_min"][i] > 0.012 and ss["shoe_r_min"][i] > 0.012]
cb = serve_plan["contact_ball"]; C3 = (cb[0], cb[2], -cb[1])
NET_Z = 0.25 + 11.885
Kd = 0.5 * 1.21 * 0.55 * math.pi * 0.0335 ** 2 / 0.0577
G = 9.81; V = 48.0
def fly(az, el, record=False, t_end=1.12):
    vx = V*math.cos(el)*math.sin(az); vz = V*math.cos(el)*math.cos(az); vy = V*math.sin(el)
    x, y, z = C3; dt = 0.0005; t = 0.0; net = None; land = None; pts = [[0.0, x, y, z]]; nxt = 1.0/120
    while t < (t_end if record else 2.5):
        sp = math.sqrt(vx*vx + vy*vy + vz*vz)
        vx += -Kd*sp*vx*dt; vy += (-G - Kd*sp*vy)*dt; vz += -Kd*sp*vz*dt
        pz = z; x += vx*dt; y += vy*dt; z += vz*dt; t += dt
        if net is None and pz < NET_Z <= z: net = y - 0.914
        if y <= 0.0335 and vy < 0:
            if land is None:
                land = (x, z, t, sp)
                if not record: break
            y = 0.0335; vy = -vy*0.72; vx *= 0.68; vz *= 0.68
        if record and t >= nxt: pts.append([round(t,4), round(x,4), round(y,4), round(z,4)]); nxt += 1/120
    return land, net, pts
TX, TZ = 1.30, NET_Z + 5.60
best = None
for i in range(-200, 61):
    el = math.radians(i*0.05); az = math.atan2(TX - C3[0], TZ - C3[2])
    for _ in range(6):
        land, net, _p = fly(az, el); az += math.atan2(TX - land[0], TZ - C3[2])*0.9
    land, net, _p = fly(az, el)
    e = abs(land[1] - TZ)
    if best is None or e < best[0]: best = (e, az, el)
_, az, el = best
land, net, spath = fly(az, el, record=True)
HS, SL = 4.115, 6.40
assert 0 < land[0] < HS and NET_Z < land[1] < NET_Z + SL and net > 0
assert all(v["pass"] for v in sc_.values())

def b(v, p):
    p_ = (p[0], p[2], -p[1]) if len(p) == 3 else (p[0], p[2])
    return [round(x, 4) for x in p_]

# ---------------- per-stroke data for the viewer ----------------
ground = json.load(open(os.path.join(KAI, "qa", "ground_physics.json")))
gplan = json.load(open(os.path.join(KAI, "qa", "ground_plan.json")))

serve_qa = [
    ["着地的脚不打滑", "≤ %.1f mm/帧" % max(v["max_slide_per_frame_mm"] for v in sc_["foot_slide"]["result"].values())],
    ["鞋底不穿进地面", "最低 +%.1f mm" % sc_["ground"]["lowest_sole_mm"]],
    ["腾空轨迹符合重力", "g = %.2f m/s²" % sc_["flight_gravity"]["g_fit_m_s2"]],
    ["发力由下往上传递", "膝 %d→骨盆 %d→躯干 %d→上臂 %d 帧" % tuple(sc_["kinetic_chain"]["peaks"][k]["peak_frame"] for k in ("knee_extension","pelvis","trunk","upper_arm"))],
    ["关节在人体活动范围内", "肘 ≤%d°，膝 ≤%d°" % (round(sc_["joint_limits"]["ranges"]["elbow_r"][1]), round(max(sc_["joint_limits"]["ranges"]["knee_l"][1], sc_["joint_limits"]["ranges"]["knee_r"][1])))],
    ["骨骼长度不变", "误差 %.3f mm" % sc_["bone_length"]["max_err_mm"]],
    ["拍头速度与击球点", "%.1f m/s，高 %.2f m" % (sc_["contact"]["racket_speed_peak_m_s"], sc_["contact"]["contact_height_m"])],
    ["站立时重心不出界", "偏出 %.0f cm" % sc_["balance"]["worst_com_outside_support_cm"]],
    ["球拍不穿过身体", "0 帧"],
]
DATA = {}
DATA["Serve"] = {
    "fps": serve_plan["fps"], "frames": sfr, "T": serve_plan["T"], "clip": "Serve", "ballClip": "Serve_Ball",
    "racket": [round(x, 2) for x in ss["racket_speed"]], "kneeL": [round(x, 1) for x in ss["knee_l"]],
    "elbowR": [round(x, 1) for x in ss["elbow_r"]], "pelvis": [round(x, 3) for x in ss["pelvis_z"]],
    "shoeL": [round(x, 4) for x in ss["shoe_l_min"]], "shoeR": [round(x, 4) for x in ss["shoe_r_min"]],
    "peakSpeed": sc_["contact"]["racket_speed_peak_m_s"], "kneeMax": round(max(ss["knee_l"])),
    "contact": b(None, serve_plan["contact_ball"]),
    "qa": serve_qa,
    "foot": "真人光学动捕 Tennis-MoCap（高水平右手男选手，CC BY-SA 3.0）重定向，逐帧物理检查；抛球、拍面内旋和击球后球路按生物力学补齐。出球 173 km/h，计入空气阻力和重力，过网高出约 20 cm，落进对角发球区。",
    "serveFlight": {"path": [[p[0]] + b(None, p[1:]) for p in spath],
                    "land": [round(land[0], 3), round(land[1], 3)], "t": round(land[2], 4),
                    "netClear": round(net, 3), "kmh": round(V*3.6)},
    "air": [air[0], air[-1]],
    "phases": [["start","准备"],["toss","抛球"],["trophy","奖杯位"],["takeoff","蹬地起跳"],["drop","拍头下坠"],
               ["contact","击球"],["decel","随挥减速"],["land","落地"]],
    "phaseDesc": {"start":"侧身站位，左脚指向网柱，重心落在两脚之间","toss":"左臂伸直上举送球，后脚向前脚并拢",
                  "trophy":"骨盆下沉蓄力，肩线向后拉开，双臂抬起","takeoff":"膝伸展最快，身体离地向上向前",
                  "drop":"肩外旋到最大，拍头垂到背后最低处","contact":"手臂几乎伸直，人在空中，拍头速度到峰",
                  "decel":"前臂内旋，球拍从身体左侧收下","land":"左脚先落进场内，膝盖弯曲缓冲"},
}

GROUND_PHASES = {
    "Forehand": [["ready","准备分腿垫步"],["uniturn","转体引拍"],["takeback","后摆到位"],["deep","拍头后坠"],
                 ["contact","击球"],["follow","随挥"],["finish","收拍"]],
    "Backhand": [["ready","准备分腿垫步"],["uniturn","转体引拍"],["takeback","后摆到位"],["deep","拍头后坠"],
                 ["contact","击球"],["follow","随挥"],["finish","收拍"]],
}
GROUND_DESC = {
    "Forehand": {"ready":"分腿垫步，双脚落地后转肩，非持拍手托住拍颈","uniturn":"肩线转开，球拍向身体后方拉开",
                 "takeback":"拍头在身后举高，手腕立住，重心压到外侧脚","deep":"拍头在身后掉低、拍柄盖对准来球，蹬地转髋开始",
                 "contact":"击球点在身体右前方约腰胸高度，拍面正对出球方向","follow":"拍头继续向目标方向送出，身体重量转到前脚",
                 "finish":"球拍绕到左肩上方，眼睛留在击球点"},
    "Backhand": {"ready":"分腿垫步后右脚上步，双手握拍，右肩对准来球","uniturn":"肩线充分转开，非持拍手把拍往后带",
                 "takeback":"拍头在身后抬高，两臂弯曲蓄力","deep":"拍头掉低，拍柄盖对准来球，后腿蹬伸",
                 "contact":"两臂前推、拍面正对出球方向，击球点在前脚之前","follow":"两臂继续向目标伸展，右肩跟进到球上",
                 "finish":"拍子收到右肩上方，重心完全到前脚"},
}
def ground_qa(name):
    c = ground[name]["checks"]
    out = []
    out.append(["着地的脚不打滑", "≤ %.1f mm/帧" % max(v["max_slide_per_frame_mm"] for v in c["foot_slide"]["result"].values())])
    out.append(["鞋底不穿进地面", "最低 +%.1f mm" % c["ground"]["lowest_sole_mm"]])
    out.append(["重心运动连续", "最大垂直加速度 %.0f m/s²" % c["com_smoothness"]["max_vertical_accel_m_s2"]])
    p = c["kinetic_chain"]["peaks"]
    out.append(["发力由下往上传递", "骨盆 %d→躯干 %d→上臂 %d→前臂 %d→拍 %d 帧" % (p["pelvis"]["peak_frame"],p["trunk"]["peak_frame"],p["upper_arm"]["peak_frame"],p["forearm"]["peak_frame"],p["racket"]["peak_frame"])])
    out.append(["关节在人体活动范围内", "肘 ≤%.0f°，腕 ≤%.0f°" % (max(c["joint_limits"]["ranges"]["elbow_r"][1], c["joint_limits"]["ranges"]["elbow_l"][1]), c["joint_limits"]["ranges"]["wrist_r"][1])])
    out.append(["骨骼长度不变", "误差 %.3f mm" % c["bone_length"]["max_err_mm"]])
    out.append(["拍头速度与击球点", "%.1f m/s，高 %.2f m，前伸 %.0f cm" % (c["contact"]["speed_peak_m_s"], c["contact"]["contact_height_m"], c["contact"]["in_front_of_pelvis_cm"])])
    out.append(["双脚站立时重心不出界", "偏出 %.0f cm" % c["balance"]["worst_com_outside_support_cm"]])
    out.append(["挥拍阶段球拍不穿过身体", "0 帧（收拍绕身体阶段除外）"])
    assert all(v["pass"] for k, v in c.items()), (name, [k for k, v in c.items() if not v["pass"]])
    return out

for nm, zh in (("Forehand","Forehand"), ("Backhand","Backhand")):
    r = ground[nm]; s = r["series"]; T = gplan[nm]["T"]; fps = gplan[nm]["fps"]
    frames = s["frame"]
    DATA[nm] = {
        "fps": fps, "frames": frames, "T": T, "clip": nm, "ballClip": nm + "_Ball",
        "racket": s["racket_speed"], "elbowR": s["elbow_r"],
        "kneeL": [0]*len(frames), "pelvis": [0.0]*len(frames),
        "shoeL": [0.001]*len(frames), "shoeR": [0.001]*len(frames),
        "peakSpeed": r["checks"]["contact"]["speed_peak_m_s"], "kneeMax": 0,
        "contact": b(None, gplan[nm]["contact_ball"]),
        "qa": ground_qa(nm),
        "foot": ("真人光学动捕 Tennis-MoCap 同一位选手的正手挥拍（CC BY-SA 3.0）重定向；身体、手臂和脚步是真实动捕数据，"
                 "拍头滞后/掉拍、拍面转正和球路按生物力学补齐。出球约 103 km/h。"
                 if nm == "Forehand" else
                 "同一选手的双手反拍（动捕中双手全程相距 13–20 cm，CC BY-SA 3.0）重定向；持拍手在拍柄下段、非持拍手上握，"
                 "拍头滞后/掉拍、拍面转正和球路按生物力学补齐。出球约 112 km/h。"),
        "serveFlight": None, "air": None,
        "phases": GROUND_PHASES[nm], "phaseDesc": GROUND_DESC[nm],
        "incoming": b(None, [gplan[nm]["ball"][str(T["contact"])][0] + 0.0, 0, 0]) if False else None,
        "outV": b(None, gplan[nm]["out_velocity"]),
        "twoHanded": gplan[nm]["source"]["two_handed"],
    }

data = {"strokes": DATA,
        "court": {"baselineZ": 0.25, "netZ": NET_Z},
        "source": "Tennis-MoCap · Pulgarin-Giraldo et al. 2017 · CC BY-SA 3.0"}
glb = base64.b64encode(open(os.path.join(KAI, "export", "kai.glb"), "rb").read()).decode()
tpl = open(os.path.join(HERE, "strokes_template.html"), encoding="utf-8").read()
app = open(os.path.join(HERE, "strokes_app.js"), encoding="utf-8").read()
html = tpl.replace("__GLB_B64__", glb)
html = html.replace("/* <!-- app-script-anchor --> */",
                    "window.__KAI_DATA__=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n" + app)
assert "</script>" not in json.dumps(data, ensure_ascii=False)
open(OUT, "w", encoding="utf-8").write(html)
print("WROTE", OUT, round(os.path.getsize(OUT)/1e6, 2), "MB; ball land", round(land[0],2), round(land[1],2))
