# Wide Reception Repair Implementation Plan

**Goal:** 修复镜像外角发球在反手侧更易漏接的问题，将人物横向活动范围统一扩大到 ±8 米，验证后 commit 并 push。

**Architecture:** 保持球场白线和球拍真实触球判定不变；修正接球站位的余量，而非扩大触球半径。移动输入、物理跑动、普通接球、空中拦截和侧扑共享独立的活动边界常量。

**Tech Stack:** TypeScript、Node test、Three.js、Rapier、Vite。

## Constraints

- 白线、发球区、发球站位限制、球员速度和球拍长度保持不变。
- 左右半场、交换场地、单双打采用同一逻辑；保留左右手及单双反的自然差异。
- 已有电脑换球员未提交修改不纳入本次提交。
- 自动测试不等于实体手机手感验收；本次 push 不宣称线上服务已部署。

## Task 1 — Reproduce and repair reception

- [x] 在 `tests/wide-reception.test.ts` 加入完整发球、合法一跳和缓存回击的左右镜像回归；覆盖两端及单双打。
- [x] `node --import tsx --test tests/wide-reception.test.ts`，确认旧代码在反手外角场景失败。
- [x] 修改 `src/simulation/reception.ts`，仅在快速向外追球时缩短反手站位余量；慢球和向内来球保持原有站位，不修改 `athlete.ts` 触球距离。
- [x] 重新运行定向测试及现有 reception / rescue / return 测试。

## Task 2 — Shared lateral runoff

- [x] 测试手动目标、实际移动、自动追球、救球全路径可越过旧 ±6/6.4 米边界，并在 ±8 米制动；场内外判罚不变。
- [x] `src/simulation/rules.ts` 定义独立 `MOVEMENT_HALF_WIDTH=8`，替代 movement、match、reception、skills、return-plan、overhead-plan 和 rescue 中旧横向限制。
- [x] 检查近远镜头及场边物件；长椅中心移至 ±10 米，避免侵入新的挥拍空间。不拉宽白线、不改变瞄准投影语义。
- [x] 运行边界、镜头、发球站位和救球回归。

## Task 3 — Verification and delivery

- [x] 最终干净快照 `npm test` 615/615、`npm run build`、`git diff --check` 通过；记录测试数量和环境依赖。
- [x] 独立审阅修改，检查隐藏的旧限制和原有未提交修改保持原样。
- [x] 写独立验证记录，只 stage 本次文件；主清单已有其他工作修改，本次保持原样。

交付命令：commit 后读取提交文件列表，push `codex/wide-reception` 分支，使用 `git ls-remote` 核对远端 SHA；实际提交标识以最终交付回复为准。
