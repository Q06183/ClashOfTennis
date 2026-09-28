# 隐藏大佬「无名」开发与验收记录

日期：2026-09-28
状态：下方保留无名初版及专属增强阶段的历史证据。用户最终澄清后已改为**全员统一属性系数**，无名不再有专属倍率文案，最新版 282/282 与十角色在线验证见 [全员更新记录](roster-scale-verification.md)。浏览器视觉/交互验收仍独立记录。

## 全属性加成 ×10 更新

- 仅无名使用 `1 ± (属性 - 60) × 原系数 × 10`。面板仍六项 99，原九位的面板和实际倍率保持原样。
- 移动/起步、正手倍率 1.468；反手/截击/发球倍率 1.975；耗体倍率 0.22；恢复倍率 1.78。不是将最终速度直接乘 10，刹车、重力、过网保护与最低飞行时间不变。
- 真实跑动测量：满体力横向峰值从林岳 5.98 m/s 提高到无名 8.77864 m/s，10 米到达测试从约 1.95 秒降至 1.50 秒（含加减速）。
- 控制接触点且力度 0.4 时：正手从 15.732 到 23.095 m/s；反手从 15.732 到 31.071 m/s；截击从 15.732 到 24.194 m/s。所有测试保持过网和目标落点。
- 新增加成、普通球员不变、双座位实际加速/跑速断言先红后绿；原属性、完整 AI 对局和网络用例通过。最终 `npm test` 272/272，日志 `artifacts/hidden-master/x10-full-tests.log`。
- 确认房间数为零后重启本仓库服务（PID 66541），未中断玩家房间。入口已变为 `index-CMbT5Ioq.js`。
- 对指定地址建立两条真实 WebSocket：无名/林岳同序号状态完全一致；无名 0.4 力度发球实测 30.82258 m/s、体力 0.9855746，证明运行中的服务器已加载新倍率。验证连接已离开。
- 在线入口脚本与构建逐字节一致，包含“属性加成 ×10”；SHA-256 为 `55986ca2bb0cd0d3531e44aa89562732927c6d2b5e737c0dcea3591944f400c4`。收据 `artifacts/hidden-master/x10-live-verification.json`。

## 权限恢复后的更新

- 用户放开本机执行权限后，重新执行 `npm test`，270/270 通过，含真实 WebSocket/HTTP 测试；日志为 `artifacts/hidden-master/full-tests.log`。
- `npm run build` 再次通过。检查时 7470 无监听，随后从本仓库启动 `node --import tsx server/index.ts`，监听 `0.0.0.0:7470`。后台 PID 为 63929，日志为 `artifacts/hidden-master/server.log`。
- 指定地址 `/health` 返回 `{"ok":true,"rooms":0}`。在线无名 GLB/PNG 的 SHA-256 与下方最终资产一致。
- 内置浏览器访问指定地址时返回用户拒绝授权；未改用其他浏览器或地址绕过。视觉交互验收保持待验。
- 用户本轮已要求更新此地址，覆盖早先“不自动部署”的范围限制。未提交或推送 Git，未影响其他项目的服务。

## 如何使用

在自己或练习对手的选人页，连续点击标题「找到你的打法。」五次。解锁提示出现后，列表末尾新增「无名 · 隐藏大佬」。选择即可使用；自己的选择与练习对手分别保存，解锁状态共享。中途选择其他球员或离开页面会重置未完成的点击计数。

角色六项属性全部 99。沿用右手双反、现有击球/体力/出界规则，未改原有九位的数值。彩蛋不是防作弊权限，好友无需解锁也能收到该角色 ID。

## 已取得的证据

| 范围 | 结果及证据 |
| --- | --- |
| 原阵容 | `tests/characters.test.ts` 精确断言九位原始六项数值、360 预算及默认回退 |
| 属性 | 双座位实际移动、发球、正手、反手、截击、体力消耗、恢复测试通过；无名系数按用户要求 ×10，普通球员保持原公式 |
| 完整对局 | `tests/hidden-master-protocol.test.ts` 的真实 `Match` + `aiInput` 完成无名/林岳、林岳/无名、无名/无名三组对局，比分合法、状态有限、体力在 0–1 |
| 解锁 | `tests/hidden-character.test.ts` 覆盖四/五次、重置、重建控制器读取存储、非法标记、读写异常、默认隐藏、六个 99 meter |
| App 接入 | `tests/hidden-character-app.test.ts` 调用真实 App action：未解锁不能选择、中断/离开重置、自己与对手分别保存、练习创建正确角色；此测试未构造 DOM 或 WebGL |
| 存储 | `tests/preferences.test.ts` 和 `tests/network-client.test.ts` 验证 localStorage/sessionStorage 被拒时启动读取、welcome 交付和 close 清理仍可继续 |
| 权威协议 | 进程内 `Rooms` 真实消息处理覆盖身份、无效 ID、选择、同步、锁定、发球、暂停、恢复、重赛；消息传输由内存 socket 替身提供，**不是实际网络证据** |
| 真实模型 | `tests/generated-athlete.test.ts` 22/22 通过，含新角色真实 GLB 的挥拍、发球、跑动、后退、救球边界/蒙皮验证 |
| 资产完整性 | `tests/hidden-master-assets.test.ts` 逐字节确认源 GLB 所有 bufferView 不变、accessor/skin 不变；新增独立纹理，独立头像尺寸 256×320，来源/输出 SHA-256 可读回 |
| 视觉证据 | 已查看 CPU 从最终 GLB 栅格化的黑金头像；不当作浏览器 GPU 截图 |
| 回归 | 257/257 不依赖端口的测试通过；仅排除了 `rooms.test.ts`、`http.test.ts`，不称全量通过 |
| 构建 | `npm run build` 通过 TypeScript、Vite 和 gzip/Brotli 预压缩；60 modules |
| 差异 | `git diff --check` 通过；未修改任何原角色 GLB/PNG，未修改服务端协议/比赛物理 |
| 复核修正 | 修复无解锁标记恢复房间后本地选人泄漏、sessionStorage 异常、属性说明展开未中断点击计数；新增回归先红后绿 |
| 二次复核 | 恢复房间后「使用这位球员」会同步明确确认的合法选择，X 不修改房间、比赛中不改 ID。独立复核无剩余发现，13 项专项测试通过 |

## 关键资产

- 模型：`public/models/characters/wuming.glb`
- 头像：`public/portraits/wuming.png`
- 可复现纹理生成：`scripts/assets/hidden-master.py`
- 无 GPU 的实际模型头像渲染：`scripts/assets/portrait-cpu.py`
- 可选 Blender 源文件/头像输出脚本：`scripts/assets/render-hidden-master.py`
- 来源与最终哈希：`assets/characters/wuming/provenance.json`
- 可编辑源：最终 GLB 可导入 Blender，保留骨骼、网格、材质；`.blend` 尚未输出，不冒称已有。
- 本地日志：`artifacts/hidden-master/unit-tests.log`（257/257）、`review-fixes.log`（13/13）、`blocked-socket-tests.log`（权限失败）；该目录被 Git 忽略。
- 已核对 `dist/models/characters/wuming.glb`、`dist/portraits/wuming.png` 与最终源资产 SHA-256 一致。

原模型 SHA-256：`05a0f878ff614556ee90ef978beff848296ea75535ce2d480619e64bc1d46801`

无名模型 SHA-256：`e942cb048a5ca17668f51707e4c2816252ca65d4a77b8f9450334022b89a9796`

无名头像 SHA-256：`73d544c991a3735a94c63a21484212daba0883fd7c35ceb1a6a31a02519b1caa`

## 先前环境阻碍记录（网络与服务启动已在上方更新中解决）

1. **全量真实网络测试**：沙箱报 `listen EPERM: operation not permitted 127.0.0.1`。提升权限执行 `npm test` 的审批失败：`404 未知模型 codex-auto-review`。真实 socket 新用例已在 `tests/rooms.test.ts`，尚未跑通，不能用进程内测试替代。
2. **浏览器手机尺寸交互/GPU**：无法在当前沙箱内启动本机服务。内置浏览器又明确拒绝 `file:` URL（只允许 HTTP/HTTPS）；未绕过该限制。需在本机服务可运行后验证默认隐藏、五击、刷新、己方/对手练习、黑金模型及双端房间。
3. **Blender 源文件**：Blender 5.2 启动时在 Metal 设备检测中崩溃，尚未运行 Python 脚本；沙箱外启动同样遇到审批服务错误。已保留源脚本，未绕过审批。
4. **Git 提交**：`.git/index.lock` 写入受沙箱限制，审批服务失败，未提交或推送。此项不阻碍文件保存和构建，不自动更改权限或模型配置。

## 恢复验证命令

```sh
npm test
npm run build
npm start
```

服务启动后应在正常 HTTP 游戏入口验收，而不是以离线包代替正式构建。端到端验收清单保持未完成；真机与异地网络仍是独立证据边界。
