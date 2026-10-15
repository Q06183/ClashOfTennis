# Kai 角色管线复用指南：新球员 / 新动作怎么做

本文档总结 Kai（网球角色 + 真人动捕发球）的完整制作方法，目标是换一个球员或换一个击球动作时，照着重做即可。
工作目录约定：`character-pipeline/kai/`（下文路径都相对它），Blender 5.2 + 无头脚本（`/Applications/Blender.app/Contents/MacOS/Blender -b -P`）。

## 总览（数据流）

```
规格/风格参考
  → 01 MPFB 人体  → 02 游戏骨架+扭转骨  → 03 服装/球拍/球  → 04 权重/握拍
  → mocap/retarget_serve（真人动捕重定向，只有大段方向是真数据）
  → flight_fix（重心抛物线）
  → racket_pass → racket_whip → speed_boost（手腕/拍面/击球加速，生物力学补齐）
  → racket_drop（肩外旋掉拍头）→ wrist_roll_lock（击球后拍杆不自转）
  → racket_clear（穿模修正）→ twist_distribute（扭转骨分担）
  → 06b 脚部接地  → 07 九项物理检查  → qa_deform_anim（变形检查）
  → 08 导出 GLB（回读验证）→ serve-viewer 单文件 HTML（Chrome WebGL 自检）
```

## 0. 先定规格（必做，决定后面所有参数）

- 性别、身高（Kai 1.865 m）、左右手、持拍手、发球类型（平击/上旋）、站位（pinpoint/平台）、发球区（平分区/占先区）。
- 视觉风格参考（Kai 用 `../../competitorExamples/Photos`，卡通写实：白衣亮边、头带）。
- 关键事件帧全部记进 `qa/serve_plan.json` 的 `T`：`start/release/trophy/drop/contact/decel/land/finish`，外加 `takeoff`、`fps`（60）。
  下游脚本（接触求解、QA、HTML）只读这个文件，不要在脚本里硬编码帧号。

## 1. 人体底模（脚本 `01_base_body.py`）

- 用 MPFB（MakeHuman 引擎，**CC0**，`~/Library/Application Support/Blender/5.2/extensions/user_default/mpfb`）：运动员体型 morph、身高、game_engine 骨骼。
- 游戏风格化：头部略放大（Kai 约 1.05 倍），比例仍保持正常（头身比不要破坏，否则动捕上去会怪）。
- 单位米；骨骼单位矩阵。

## 2. 骨架与权重（`02_add_rig_setup.py`、`04b_weights.py`）

- 57 根骨骼：MPFB game_engine 53 根 + 4 根扭转骨 `upperarm_twist_01_{l,r}`、`lowerarm_twist_01_{l,r}`（发球要 140°+ 外旋/内旋，没有扭转骨肩部必破）。
- 每个顶点最多 4 根骨骼影响、权重归一化（glTF 限制）；删掉 MPFB 的非骨骼顶点组（region mask），否则导出和 QA 会出错。
- 扭转骨分担：上臂局部扭转的 90% 反向写到 `upperarm_twist_01_*`（`mocap/twist_distribute.py`，K=0.9 是扫出来的），前臂扭转 50% 写到 `lowerarm_twist_01_r`。扭转角要按角度展开（unwrap ±π），不能直接逐帧四元数。
- 握拍：大陆式（continental）。手指弯曲用程序解到皮肤接触拍柄（`qa/grip.json` 存握拍姿态），手掌不得插进柄。`Kai_Racket` 用 BONE 父级挂在 `hand_r` 上，柄在手部局部 +Y 约 0.075 m。

## 3. 服装和道具（`03_outfit_props.py`）

- 衣服从身体表面克隆（同拓扑、同蒙皮），沿法线外扩 1.6 cm（下摆略厚），饰边沿平滑边缘环生成，下摆用水平面切。
- 球拍按 ITF 尺寸：总长 0.685 m，拍头宽 0.242 m；球半径 0.0335 m。甜区 = 局部 (0,0.5,0)，拍面法线 = 局部 +Z。
- 隐藏衣服/短裤下的皮肤，防止穿帮。

## 4. 动作参考：真人动捕（最重要的一节）

**数据集**：Tennis-MoCap — https://github.com/jdpulgarin/Tennis-MoCap ，**CC BY-SA 3.0**（再分发必须署名）。
论文：Pulgarin-Giraldo J.D. et al., 2017, LNCS 10125, pp.309–317, doi:10.1007/978-3-319-52277-7_38。

- 格式：BVH，100 Hz，Y 轴向上、厘米，旋转通道顺序 ZXY；关节为 Optitrack 风格：
  `Hips / Chest / Neck / Head / Head_End`，肩带 `LeftCollar/RightCollar → Shoulder → Elbow → Wrist → Wrist_End`，
  腿 `Hip → Knee → Ankle → Ankle_End / Ball`。`labels.csv` 列了 7 次发球和击球帧（RightWrist 高度峰）。
- Kai 选 `data/jarua_Servicio.bvl` 的第 3 次一发，取击球前 1.55 s 到后 0.95 s。
- **选击球帧**：不要用 labels 原值，自己扫 RightWrist 高度峰并减 3–5 帧。原因：手腕骨 `Wrist→Wrist_End` 带的是内旋信息，真正的击球（肘接近伸直、拍面正对）发生在手腕峰前几帧。
- **缩放**：按腿长比例 S = Kai 腿长 / 源腿长（Kai S=1.136），不要按身高（源数据身高量不准）。
- **坐标变换**：BVH→Blender：`(x,y,z)cm → (x,z,-y)m`，再整体绕竖轴旋转让发球方向对准 −Y（球网）。
- 新数据集要重写关节名映射表（在 `mocap/retarget_common.py`），并先验证左右手（比较肩线两侧 RightWrist 在击球帧的 x 和高度）。
- 该数据集**只有发球**。正反手/移动需要别的来源（CMU 没有网球；可选视频动捕 Rokoko / Move.ai 再走同一套重定向，或 IMU 数据）。

## 5. 重定向（`mocap/retarget_serve.py`）

只用动捕的**大段方向**，逐骨匹配，逐帧方向误差 0.00°（`mocap/verify_retarget.py` 验证）：

- 骨盆/脊柱/颈/头：骨方向 = 源段方向；扭转角取肩线/髋线（骨盆和脊柱的侧向参考）。
- 四肢（大臂、大腿、前臂、小腿）：最小扭转匹配方向。
- **肘、膝必须按铰链弯曲面定扭转**（`aim_hinge`），否则四肢转的是"哪一面"没约束，手臂会怪。
  关键坑：肘/膝接近伸直时，弯曲面会在相邻帧翻转（Kai 在第 98 帧出现 72° 单帧翻转）。处理方法：保持上一帧弯曲面、按铰链轴向连续性混合（在 `mocap/arm_cleanup.py` 的 `twist_smooth` 里，平行传输 + σ=2 帧高斯平滑；只平滑沿骨轴的 roll，方向不变）。
- 手腕骨不可用：源里 `Wrist→Wrist_End` 在 T-pose 下就和前臂成 90°，它只携带前臂旋前/旋后，不能当手的方向。见第 6 节。
- 脚：足方向用源段 + 固定的静止俯仰（约 26.8°），击球前帧的并脚/拖步允许在 `serve_plan.drag_windows` 内。
- 根位置：水平 = 源髋路径 ×S 平移到球场站位（Kai 中线 −0.12 m，底线后约 0.12 m）；竖直先按脚部离地高度匹配，第 7 节再修正。
- 重采样 100→60 fps。

## 6. 手腕、拍面和加速（动捕没有，按生物力学补）

这部分**不是动捕数据**，UI/README 里要如实写。参考：Elliott/Fleisig 的发球运动学（肩外旋约 160–170°、内旋是拍头速度主要来源、肘 0–150°、职业拍头 35–50 m/s）。

- `mocap/racket_pass.py`：解剖学手腕角（屈/伸、尺/桡偏、旋前/旋后）关键帧——准备、奖杯位、最大外旋掉拍、击球、随挥。
- `mocap/racket_whip.py`：在**前臂世界坐标系**里驱动球拍：击球前滞后（lag），击球帧拍面正对球网，击球后内旋。参数扫 τ/lean/外推量。
- `mocap/speed_boost.py`：在击球前后 ±约 0.1 s 加钟形角位移增量，把拍头峰值校到 37–38 m/s、峰值落在击球帧或后 1 帧；同时保证拍面对网 ≥0.985、手腕摆角 ≤80°。
- 球：左手垂直速度峰为出手帧；抛球弹道解到甜区；击球后 48 m/s 出球，带二次阻力项，搜索方位/仰角落进对角发球区（`serve-viewer/_src/build.py` 复验过网高度和落点）。

**三轮 review 沉淀下来的修法（换动作大概率还会遇到）**：

1. **掉拍头不够**：动捕没有肱骨外旋。`mocap/racket_drop.py` 沿大臂骨轴加外旋角 φ(t)，在击球前约 0.07 s（Kai 第 90 帧）到峰、击球帧回到 0（击球姿势不动）；峰幅用搜索定（Kai 140°），目标"球拍离竖直向下 ≤45°、不撞头/背"，同步重算扭转骨。
2. **击球前手腕单帧爆转**（曾达 104°/帧）：沿手姿态同一路径做弧长重定时，角速度改钟形峰（`arm_cleanup.py` 第 3 段），路径不变、只分配时间。
3. **击球后球拍绕拍杆自转**（观众一眼能看见）：判据是把球拍相邻帧旋转分解成"挥拍 swing + 绕杆 residual spin"，residual 要 ≈0。修法：从击球帧起对球拍姿态做沿自身轴路径的平行传输（零自转，`mocap/wrist_roll_lock.py`），再反解手腕；挥拍方向逐帧偏差 0.00°。
4. **引拍绕到身后/手举过头**：用躯干相对系从准备姿态单调插值到奖杯姿态（`arm_cleanup.py` 的直接上举段），保证任何帧不高于奖杯位；不要在世界系硬拉球拍方向（会逼出 150° 反关节手腕）。
5. **球拍穿身体/腿**：`mocap/racket_clear.py`——BVH 逐帧检测，在手腕三个解剖轴上搜最小修正角，用"包络 + 高斯平滑"避免突变。

## 7. 物理修正

- `mocap/flight_fix.py`：腾空段只修 Root 的 z，让**全身重心**（不是骨盆）做自由落体，拟合 g 应在 9.81±0.5；两端归零。注意：动了手臂后重心分布会变，加了外旋段后要重跑一次。
- `06b_contact_solve.py`：着地帧只转腿（IK）把鞋底贴地，水平接触点锁定不滑；离地阶段不处理。
- 平衡：双脚支撑帧重心投影在支撑凸包内 ≤10 cm。

## 8. QA 关卡（`07_physics_qa.py`，全过才允许打包）

| 检查 | 通过线（Kai 实测） |
|---|---|
| 脚滑动 | ≤4 mm/帧（拖步窗口除外） |
| 地面 | 鞋底最低 ≥0，腾空帧双脚离地 |
| 腾空重力 | 拟合 g 9.36–10.26，实测 9.81 |
| 发力链 | 膝→骨盆→躯干→上臂→前臂→球拍峰值依次（允许同帧），前臂/球拍在击球帧 ±2 |
| 关节范围 | 右肘 ≤150、膝 ≤155、腕 ≤80（实测肘 8–109、腕 14–73） |
| 骨骼长度 | 误差 ≤0.5 mm |
| 击球 | 甜区-球距 <4 cm；拍面对网；拍头 35–50 m/s，峰值在击球帧 +1 内；击球点在骨盆前、头顶上 |
| 平衡 | 重心偏出支撑面 ≤10 cm |
| 球拍-身体 | 0 帧相交（BVH，间距 5 cm/法向阈值） |
| 网格变形（`qa_deform_anim.py`） | 身体 99% 边长比 ≤1.5；上衣目标 ≤2.0（Kai 身体 1.33、上衣 1.93；少数极短袖笼边最大约 4.7 倍，正常视角不可见） |

衣服权重如果腋下超 2.0：先加大扭转骨分担 K，再对上衣权重做空间高斯平滑（`shirt_weights_smooth.py`，σ=4.5 cm，只在拓扑顶点间）。不要直接从"被裁掉躯干的身体"做最近面转移权重（身体网格被衣服遮挡部分删过面，会找错面）。

## 9. 导出与预览

- `08_export_glb.py`：GLB，烘焙采样 60 fps，`Serve`（骨骼）和 `Serve_Ball`（球位置）两个动作；导完在空场景回读校验骨骼数、蒙皮网格、三角面（Kai 44,410）、动作数和帧数。
- `serve-viewer/_src/build.py`：单文件 HTML，GLB base64 内嵌、three.js 0.147 走 jsDelivr；内含 4 机位、三档速度、8 阶段时间轴、速度/角度曲线、带阻力球路；build 脚本**断言九项检查全过**并复验球落在发球区。
  无 WebGL 时回退关键帧图（`assets/kai_serve_keyframes.png`，由 `render_serve.py` + ffmpeg 拼）。
- 自检：html skill 的 `shot.py` 做静态检查；WebGL 画面必须用 Chrome 无头截图核对（shot.py 自带浏览器截不到 WebGL）：
  `Google Chrome --headless=new --use-angle=metal --enable-webgl --ignore-gpu-blocklist --virtual-time-budget=12000 --screenshot=... "file://...#f=94&cam=side&speed=0.25"`
  headless 下 requestAnimationFrame 被节流，逐帧核对要靠深链定位帧，不能等播放。

## 10. 换一个新球员时的最小清单

1. 规格表：身高、左右手、发球类型、站位、风格图。
2. 改 01 的 morph 和服装（球拍/球可复用）。骨架不动。
3. 选动捕片段：同数据集就改 BVH 文件名/击球帧/时间窗；不同数据集先写关节映射 + 轴向 + 单位转换，跑 `verify_retarget.py` 确认方向误差 0。
4. 按 S=腿长比重算缩放、站位偏移、左右手镜像（镜像时重验 handedness）。
5. 跑第 6 节的手腕/球拍段：关键帧角度大部分可复用，重新做的只有：掉拍头峰幅搜索、speed_boost 校准、穿模修正搜索。
6. flight_fix → 06b → 07 全过；变形不过先调扭转 K 再平滑上衣权重。
7. 08 导出 → 更新关键帧图 → build HTML → Chrome 截图核对。
8. README/HTML 署名动捕数据集（CC BY-SA 3.0 是硬性要求）。

## 数据契约（文件之间）

- `qa/serve_plan.json`：`T` 八阶段帧、`takeoff/land/fps`、`contact_ball`、`face_normal`、`toss_v`、`ball`（逐帧球位）、`drag_windows`、`source`、历次 `review_fixes` 记录。
- `qa/physics_report.json`：`checks`（九项，含 pass 布尔）+ `series`（逐帧曲线）。06b、HTML build 都依赖它。
- `qa/mocap_retarget.json`：源文件、授权、接触帧、缩放 S、fps。
- `qa/grip.json`：握拍姿态和球在手中的局部位置。
- `qa/{twist_distribution,shirt_weights,scapular_rhythm,deform_anim,export_check}.json`：各关卡参数和结果。

## 已知局限（复用前要知道）

- 手腕/拍面/击球前后是生物力学重建，不是动捕原始数据；要更真实的拍面控制需要带手部标记或 IMU 的数据集。
- Kai 还没接进游戏（游戏现用 16 骨骼 `direct-original-v1`，接入要写骨骼映射）。
- 脚本是多轮 review 迭代出来的，存在功能重叠（如 `followthrough.py` 的部分职责已被 `wrist_roll_lock.py` 取代）；新球员项目建议按第 10 节顺序精简成一条干净管线，旧 blend（`*_backup.blend`）只在需要回溯时保留。
- 单次发球是 151 帧的非循环片段，没有站立/走动/其他击球；做系列动作时复用重定向+QA 这套框架，但每个动作要重新定生物力学关键帧。
