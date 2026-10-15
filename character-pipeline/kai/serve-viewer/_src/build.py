"""Build the single-file serve viewer: inline data (from QA json), the GLB (base64) and the app script."""
import json, base64, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
KAI = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(os.path.dirname(HERE), "Kai发球动作预览.html")

rep = json.load(open(os.path.join(KAI, "qa", "physics_report.json")))
plan = json.load(open(os.path.join(KAI, "qa", "serve_plan.json")))
s = rep["series"]; ck = rep["checks"]
fr = s["frame"]
air = [f for i, f in enumerate(fr) if s["shoe_l_min"][i] > 0.012 and s["shoe_r_min"][i] > 0.012]

# ---- post-contact ball flight in three.js coords (glTF Y-up: (x, y, z)_blender -> (x, z, -y))
cb = plan["contact_ball"]; C = (cb[0], cb[2], -cb[1])
NET_Z = 0.25 + 11.885
K = 0.5 * 1.21 * 0.55 * math.pi * 0.0335 ** 2 / 0.0577      # quadratic drag / mass
G = 9.81; V = 48.0
def fly(az, el, record=False, t_end=1.12):
    vx = V * math.cos(el) * math.sin(az); vz = V * math.cos(el) * math.cos(az); vy = V * math.sin(el)
    x, y, z = C; dt = 0.0005; t = 0.0; net = None; land = None; pts = [[0.0, x, y, z]]; nxt = 1.0 / 120
    while t < (t_end if record else 2.5):
        sp = math.sqrt(vx * vx + vy * vy + vz * vz)
        vx += -K * sp * vx * dt; vy += (-G - K * sp * vy) * dt; vz += -K * sp * vz * dt
        pz = z; x += vx * dt; y += vy * dt; z += vz * dt; t += dt
        if net is None and pz < NET_Z <= z: net = y - 0.914
        if y <= 0.0335 and vy < 0:
            if land is None:
                land = (x, z, t, sp)
                if not record: break
            y = 0.0335; vy = -vy * 0.72; vx *= 0.68; vz *= 0.68
        if record and t >= nxt: pts.append([round(t, 4), round(x, 4), round(y, 4), round(z, 4)]); nxt += 1.0 / 120
    return land, net, pts
TX, TZ = 1.30, NET_Z + 5.60
best = None
for i in range(-200, 61):
    el = math.radians(i * 0.05); az = math.atan2(TX - C[0], TZ - C[2])
    for _ in range(6):
        land, net, _p = fly(az, el); az += math.atan2(TX - land[0], TZ - C[2]) * 0.9
    land, net, _p = fly(az, el)
    e = abs(land[1] - TZ)
    if best is None or e < best[0]: best = (e, az, el)
_, az, el = best
land, net, path = fly(az, el, record=True)
print("BALL land", round(land[0], 2), round(land[1], 2), "t", round(land[2], 3), "net_clear", round(net, 3), "km/h", round(V * 3.6))
HS, SL = 4.115, 6.40
assert 0 < land[0] < HS and NET_Z < land[1] < NET_Z + SL and net > 0, "serve not in the box"

def r(v, n): return [round(x, n) for x in v]
qa = [
    ["着地的脚不打滑", "≤ %.1f mm/帧" % max(v["max_slide_per_frame_mm"] for v in ck["foot_slide"]["result"].values())],
    ["鞋底不穿进地面", "最低 +%.1f mm" % ck["ground"]["lowest_sole_mm"]],
    ["腾空轨迹符合重力", "g = %.2f m/s²" % ck["flight_gravity"]["g_fit_m_s2"]],
    ["发力由下往上传递", "膝 %d → 骨盆 %d → 躯干 %d → 上臂 %d 帧" % tuple(ck["kinetic_chain"]["peaks"][k]["peak_frame"] for k in ("knee_extension", "pelvis", "trunk", "upper_arm"))],
    ["关节在人体活动范围内", "肘 ≤%d°，膝 ≤%d°" % (round(ck["joint_limits"]["ranges"]["elbow_r"][1]), round(max(ck["joint_limits"]["ranges"]["knee_l"][1], ck["joint_limits"]["ranges"]["knee_r"][1])))],
    ["骨骼长度不变", "误差 %.3f mm" % ck["bone_length"]["max_err_mm"]],
    ["拍头速度与击球点", "%.1f m/s，高 %.2f m" % (ck["contact"]["racket_speed_peak_m_s"], ck["contact"]["contact_height_m"])],
    ["双脚站立时重心不出界", "偏出 %.0f cm" % ck["balance"]["worst_com_outside_support_cm"]],
    ["球拍不穿过身体", "%d 帧" % len(ck["racket_body_clearance"]["frames_with_intersection"])],
]
assert all(v["pass"] for v in ck.values()), "physics report has failing checks"
data = {
    "fps": plan["fps"], "frames": fr, "T": plan["T"], "air": [air[0], air[-1]],
    "racket": r(s["racket_speed"], 2), "kneeL": r(s["knee_l"], 1), "elbowR": r(s["elbow_r"], 1),
    "pelvis": r(s["pelvis_z"], 3), "shoeL": r(s["shoe_l_min"], 4), "shoeR": r(s["shoe_r_min"], 4),
    "peakSpeed": ck["contact"]["racket_speed_peak_m_s"], "kneeMax": round(max(s["knee_l"])),
    "court": {"baselineZ": 0.25, "netZ": NET_Z},
    "source": "Tennis-MoCap · Pulgarin-Giraldo et al. 2017 · CC BY-SA 3.0",
    "flight": {"contact": [round(c, 4) for c in C], "path": path, "land": [round(land[0], 3), round(land[1], 3)], "t": round(land[2], 4)},
    "qa": qa,
    "foot": "动作数据来自真人光学动作捕捉数据集 Tennis-MoCap（高水平右手男选手，CC BY-SA 3.0，Pulgarin-Giraldo et al. 2017），重定向到 Kai 后逐帧做物理检查；球拍内旋和击球后球路按生物力学规律补齐。出球 %d km/h，计入空气阻力和重力，过网高出 %d cm，落进对角发球区。" % (round(V * 3.6), round(net * 100)),
}
glb = base64.b64encode(open(os.path.join(KAI, "export", "kai.glb"), "rb").read()).decode()
tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
app = open(os.path.join(HERE, "app.js"), encoding="utf-8").read()
html = tpl.replace("__GLB_B64__", glb).replace("__FALLBACK_SRC__", "assets/kai_serve_keyframes.png")
html = html.replace("/* <!-- app-script-anchor --> */", "window.__KAI_DATA__=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n" + app)
assert "</script>" not in app and "</script>" not in json.dumps(data, ensure_ascii=False)
open(OUT, "w", encoding="utf-8").write(html)
print("WROTE", OUT, round(os.path.getsize(OUT) / 1e6, 2), "MB")
