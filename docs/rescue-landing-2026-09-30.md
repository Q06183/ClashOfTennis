# 救球落地与大小跳修复（独立 worktree）

## 需求与结果

用户确认沿用 **1.2m 横向位移分界**。本轮只修救球移动目标、短跳收势和恢复规则，不改模型外观、属性、体力概率、3.5m 范围、9m/s 速度、65m/s² 加速度或 0.5s 补滑定格。

| 需求 | 实现 | 验证 |
|---|---|---|
| 飞身后不回起跳点 | 起跳时把旧 tx/tz 换成实际落点；结束时不重设坐标/目标 | 真实 Match 双座位、左右手、大小跳，解除后继续模拟同一回合仍停在落点 |
| 近距离小跳 | ≤1.2m，含近距离高球：侧跳、脚落地，下降时收拍/收脚/回正 | 原实际触球阶段不缩短；落地边界即解除救球，下一 tick 可以移动，下一拍可合法触球 |
| 远距离大跳 | >1.2m 一律撑地，不再因触点较高走无倒地分支 | 1.20/1.21m 边界及较高触点的真实起跳；canonical .68–1.18s 完整 0.5s 起身 |
| 新输入保留 | 起跳后新点的目标不被落地逻辑覆盖 | 空中排队指令落地后从当前位置按正常加速度执行 |
| 模型/联机一致 | 共用 short/recovery 和权威时间，不增加协议状态 | 10 个正式 GLB、20/30/60fps；双 WebSocket 快照；20Hz SnapshotPlayback |

## 根因与动作时序

旧实现的横移本身已经写入 `p.x/p.z`，但普通移动目的地仍是起跳前的 `p.tx/p.tz`。
旧真实 Match 记录中，人物落在 x≈2.8m，恢复 0.8s 后又回到 x≈0.085m，
此时仍在同一回合，不能归因于换分重置。

修复后，在起跳时清除旧目的地，而不是在落地时覆盖目的地，保留玩家后续新指令。
原短扑只是把落地后恢复压缩为 1.75 倍，仍多锁约 0.4s；现在不再压缩时钟，
而是在下降的 canonical .28–.48s 内完成收势，.48s 直接解锁。

自然跳跃的前 .20s 按实际 travel 拉伸：
- 小跳总锁定时间 = `travel + .28s`，落地后额外惩罚为 **0**。
- 大跳总锁定时间 = `travel + .98s`，包含下降/倒地缓冲以及 **.50s** 起身。
- 触球补滑定格使用独立的真实时间倒计时；冻结期间比赛时间不走，不混为起身惩罚。

本轮样例：小跳 travel=.38s，120Hz 第一个自由 tick 在起跳后 .6667s，
落点 x=.55m；大跳 travel=.52s，在起跳后 1.50s 解锁，落点 x=2.80m。
无新移动时始终留在各自落点；有新移动时从该落点走向新目标。

## 验证记录

证据目录：`artifacts/rescue-landing/`。

- `red.log`：旧行为 5 项失败，覆盖旧目标、小跳锁定、未完成落地姿态、近距离高球及释放姿态跳变；原大跳惩罚/新输入保留作为保护测试通过。
- `final-tests.log`：最终 **516/516**；其中新增/扩展测试覆盖 1.2m 分界、落地后下一拍、移动、真实模型与网络播放。
- `build.log`：TypeScript、Vite、gzip/Brotli 构建通过。
- `network.log`：4/4 双 WebSocket 测试；包括补滑成功/超时/断线，以及大小跳落地、完整起身惩罚、自由移动与同序号双端一致。
- `replay-report.json`、`clips.json`：16 组真实 Match 固定来球回放（左右手×双座位×大小跳×有无新移动），从实际模拟采集，不是静态摆姿势。
- `short-land.png`、`long-land.png`、`long-rising.png`、`long-recovered.png`、`left-short-land.png`、`left-short-moving.png`：浏览器正式纹理 GLB 验证。
- `landing-comparison.png`：大小跳落地对照，橙圈起点、蓝圈落点。
- `candidate-game.png`：独立实际游戏练习入口/正式模型加载；浏览器 error 日志为空，帮助文案核对通过。
- `live/live-verification.json`：候选 7481 服务正常 WebSocket 发球触发无预设滑动的自动救球，补滑成功和超时均验证、双端快照一致；没有注入服务器状态或固定线上 RNG。

### 测试夹具说明

原始基线全量测试引用了未纳入 Git 的 Bob/Saba 源 GLB，初次新 worktree 缺失这两项文件。
仅将原工作区的两份原始文件复制到本 worktree 的 ignored artifacts 目录后，
基线 504/504 通过；没有修改测试预期或模型。新测试的蒙皮接地检查逐顶点转换到世界空间，
避免旋转后的包围盒角点比真实皮肤更低造成假阳性。

## 交付与隔离边界

- 独立 worktree：`/Users/bytedance/.codex/worktrees/rescue-landing/TennisClash`。
- 分支 `codex/rescue-landing`，基于 `210a959a003b799789d9e4240590307abf536159`。
- 正式原工作区和 **7470 服务未修改、未重启**；没有合并、推送或外部发布。
- 候选游戏：`http://127.0.0.1:7481/`（仅本机）。
- 动作回放：`http://127.0.0.1:5196/scripts/assets/rescue-landing-lab.html`。
- 候选最终入口 `/assets/index-CTWtKPT8.js`，SHA-256 `a7f7de635e6aa951d2c6e22e92ff08a50e371aea9b43e3cf191b0b73b743c96c`。
- 本轮为自动化、本机浏览器和双 WebSocket 验证；尚未进行真人双手机连续对局，不将其表述为正式发布或真机手感验收。

复现回放：在 worktree 执行 `node --import tsx scripts/verify-rescue-landing.ts`，
然后 `npx vite --host 127.0.0.1 --port 5196 --strictPort` 打开上述回放页面。
候选游戏使用 `npm run build` 后 `PORT=7481 HOST=127.0.0.1 npm start`。
