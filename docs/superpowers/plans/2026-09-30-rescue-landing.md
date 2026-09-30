# Rescue landing Implementation Plan

**Goal:** 所有救球停在落点；横移 ≤1.2m 的小跳落地即解锁，>1.2m 的大跳保留倒地和 0.5s 起身。

**Architecture:** 修复权威模拟的旧移动目标，统一短跳的物理时钟、姿态恢复和移动解锁。保留现有短跳/撑地分支，不新增模型或协议状态。

**Tech Stack:** TypeScript, Node test runner, Three.js, Rapier, WebSocket, Vite.

## 已确认设计与边界

- 用户已确认 1.2m 分界和本计划对应的大小跳行为。
- 起跳时 `p.tx=target.x; p.tz=target.z`，清除旧追球目标；之后的手动移动输入不在落地时覆盖。
- `short` 按横向实际位移决定，包括高球；只有小跳使用 `step-out`。
- 小跳保持原触球阶段，在 canonical `.28–.48s` 收拍、收脚、回正；`.48s` 落地立即结束救球，不保留起身锁。
- 大跳 canonical `.68–1.18s` 的 0.5s 起身不变。自然飞行仅拉伸 `.20s` 前的触球阶段。
- 概率、范围、速度/加速度、触球合法性与 0.5s 补滑不变。不部署或重启原 7470 服务，不合并主工作区。

## 执行清单

- [x] 1. 新增 `tests/rescue-landing.test.ts`：真实 Match 双座位/左右手落点保持、旧目标清除、新输入保留、小跳时钟边界、大跳惩罚、姿态/拍头连续性、短高球分类。
  - 执行 `node --import tsx --test tests/rescue-landing.test.ts`，保存失败证据。
- [x] 2. 修改 `src/simulation/match.ts` 起跳目标与恢复类型；`src/simulation/rescue.ts` 短跳分类、姿态恢复和落地解锁；`src/render/rescue-strokes.ts` / `player.ts` 短跳收拍落脚与普通移动衔接。
  - 删除原短跳 `rescueAge` 中落地后的 1.75 倍恢复压缩。
  - `moveRescue` 比较 `r.short ? RESCUE.landAt : RESCUE.duration`，解除时清掉救球残余挥拍。
  - 执行新增测试及 rescue、reference-rescue、auto-rescue-window 相关测试，确认先红后绿。
- [x] 3. 扩展双 WebSocket 测试检查短跳落地解除、落点一致与新输入执行；同步教程说明。
  - 执行 `node --import tsx --test tests/auto-rescue-network.test.ts`。
- [x] 4. 生成确定性真实 Match 回放，用正式 GLB 在浏览器查看大小跳、落地及后续移动；保存截图和数值证据。
  - 运行 `npm test`、`npm run build`、`git diff --check`。
- [x] 5. 更新 `docs/MASTER_CHECKLIST.md` 与本计划，记录验证/原工作区不变/未发布边界，提交独立分支。

最终验收与复现命令见 `docs/rescue-landing-2026-09-30.md`；516/516、构建、独立候选服务验证通过。用户要求独立 worktree，保留分支，不自动合并/发布。

## 基线与环境

- 基线提交 `210a959a003b799789d9e4240590307abf536159`，独立分支 `codex/rescue-landing`。
- 基线 504/504。两个未纳入 Git 的原始 GLB 测试夹具从主工作区复制到本 worktree 的 ignored artifacts 目录后通过；未改原始测试或模型。
- 真实 Match 复现：落点 x=2.8，旧 tx=0，恢复 0.8s 后 x≈0.085，仍为同一 rally。
- 证据目录 `artifacts/rescue-landing/`；本机/浏览器验证不是双手机真人验收。
