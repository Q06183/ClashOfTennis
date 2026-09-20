# 好友网球 Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task in this session. 用户已授权继续实施，不再增加执行方式确认。

**Goal:** 手机浏览器内完成具有 Tennis Clash 核心手势与场景体验的好友网球对战。

**Architecture:** 客户端 Three.js 场景只渲染快照。共享 TypeScript 模拟使用 Rapier 推进网球运动，负责触球、规则、AI；Node WebSocket 服务管理权威对局和房间。

**Tech Stack:** TypeScript, Vite, Three.js, Rapier, Node.js, ws, node:test。

## Global Constraints

- 竖屏优先；点按跑位，滑动方向、长度、速度分别参与击球；不自动替真人击球。
- 一块球场，两套外观，共用公平属性。不做充值、订阅、联赛、联盟。
- 首版采用先到 7 分且领先 2 分；双误、出界、下网、二跳和接发规则真实判定。
- 逻辑目标 60 Hz，网络约 20 Hz；断线冻结、30 秒重连窗口。
- 所有进度只更新 docs/MASTER_CHECKLIST.md；本计划为步骤说明，验收证据以主清单为准。

## Task 1: 模拟、规则、输入和可重复验证

Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/simulation/{types,physics,match,ai}.ts`, `src/input/gesture.ts`, `tests/{rules,match,gesture}.test.ts`。

Interfaces: `initPhysics(): Promise<void>`；`Match` 提供 `state: MatchState`, `input(seat: Seat, command: Input): void`, `step(dt: number): void`, `dispose(): void`。`Input` 为 move `{x,z}` 或 shot `{aim,depth,power,lob}`。`MatchState` 为可序列化快照，包括两人位置、体力、球位置速度、比分、发球人、阶段、事件。

- [ ] 写规则测试并运行 `npm test`，确认缺失功能导致失败。
- [ ] 实现 `serverForPoint(total)` 和 `winnerForScore(score)`，验证序列和 7 分领先 2 分。
  ```ts
  assert.deepEqual(Array.from({length:7}, (_, n) => serverForPoint(n)), [0,1,1,0,0,1,1]);
  assert.equal(winnerForScore([7,6]), null);
  assert.equal(winnerForScore([8,6]), 0);
  ```
- [ ] 用固定步长推进真实模拟，验证一发/二发、无人操作不会回球、有限触球距离、自然落地判定。
- [ ] 实现手势归一化并测试短快滑与长慢滑的力量/深度区别，以及对面玩家的方向变换。
- [ ] 实现 AI 控制器，通过与真人相同的 Input 接口移动和击球，测试完整比赛能够结束且产生多拍回合。

## Task 2: 好友对战服务

Files: `server/{index,rooms}.ts`, `src/network/client.ts`, `tests/rooms.test.ts`。

Interfaces: 客户端消息 `create`, `join`, `resume`, `ready`, `input`, `leave`, `ping`；服务端 `welcome`, `room`, `state`, `error`, `pong`。座位令牌只发给对应本人，房间广播不包含令牌。服务监听环境变量 PORT，静态生产资源来自 dist。

- [ ] 启动临时端口的真实 WebSocket 服务，先写 create/join/ready/snapshot 测试并确认失败。
- [ ] 使用随机六位房号及不可预测重连令牌，限制两人、房间数量、消息大小、频率和数值。
- [ ] 双方 ready 创建 Match。60 Hz 推进，20 Hz 广播。测试第三人拒绝、房间隔离、非法输入无效。
- [ ] 断线暂停，resume 恢复；测试暂停期间球和时间不变，超时结束。空房回收释放 Rapier 世界。
- [ ] 两人再次 ready 时产生全新对局；测试比分、体力及发球状态重置。

## Task 3: 3D 球场和手机操作

Files: `index.html`, `src/main.ts`, `src/render/{court,player,view}.ts`, `src/input/controls.ts`, `src/ui/{app,style,audio}.ts`（CSS 为 style.css）。

Interfaces: `CourtView(container)` 提供 `render(state, seat, dt)`, `courtPoint(screenX,screenY)`, `setMode(mode)`, `dispose()`。Controls 输出 Input；UI 只依赖 MatchState/RoomView。

- [ ] 首先建立浏览器手动验收步骤：首页三个入口、训练发球、点按跑位、滑动回球、结果页、好友加入。
- [ ] 创建完整透视球场、白线网格、网柱、看台、树木、球影；使用自制低面数人体、关节动画、球拍和两套配色。
- [ ] DOM 界面提供手机安全区、明显房号、一键复制与手动复制回退。游戏中仅保留紧凑比分、体力、短提示。
- [ ] 球拍触球/反弹音效由用户首次操作后解锁；支持静音。触控采用 pointer capture 和 touch-action:none。
- [ ] 训练复用 Match；联网使用服务器快照插值，本方移动预测受服务器位置校正。
- [ ] 验证初次加载、失败/重试、断网/重连、窗口缩放、WebGL 不可用提示、退出资源清理。

## Task 4: 验证和可交付服务

Files: `README.md`, `Dockerfile`, `.dockerignore`, `docs/MASTER_CHECKLIST.md`, `docs/verification.md`。

- [ ] `npm test`：全部规则和真实 WebSocket 测试通过。
- [ ] `npm run build`：类型检查和 Vite 生产构建通过。
- [ ] 使用 game-playtest 流程在浏览器验证首页、训练、好友房间以及竖屏布局；保存截图并记录问题/修复。
- [ ] 两个独立客户端实际完成一场比赛并再赛，核对快照比分一致。
- [ ] 启动 `npm start`，给出 localhost 和当前局域网地址、操作说明。生产服务提供 `/health`。
- [ ] 提供 HTTPS/WSS 部署路径。实际公网地址只有部署并验证后才标记通过；无公网宿主时明确保留缺口。
- [ ] 真机触控和异地真人对打未实际发生时，保持未验证，不将目标标记完成。
