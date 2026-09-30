# 双打与三场地合并 main / 7470 发布

时间：2026-09-30 17:20:53（Asia/Shanghai）。

## 合并结果

- 本地 `main` 合并到 `909479e`，同时包含双打分支 `9cc14d7` 和原主线 `767f7fc`。
- 两处冲突经用户逐项确认：操作帮助保留最新救球恢复规则和动态赛制；主清单保留两侧验收记录。
- `src/render/player.ts`、`src/render/rescue-strokes.ts` 与原 main 完全一致；模型、头像和其他角色资产未更改。
- 合并候选与主目录分别全量通过 **564/564**；类型检查、生产构建和 `git diff --check` 通过。
- 已清理完成且获批的临时 `.merge-review`，保留功能 worktree 及回滚备份。
- 本轮仅合并本地 main，**未推送 GitHub**，也没有移动其他聊天的开发分支。

## 服务切换

- 持续检测房间，用户结束对局后，再次确认 `/health` 为 **0 房间**才切换。
- 旧 PID `40289` 正常退出，新 PID `46760` 从 `/Users/bytedance/Desktop/TennisClash` 启动，监听 `0.0.0.0:7470`。
- 发布入口 `/assets/index---D0gofB.js`。
- SHA-256：`f4e80a583b2c0ead62758e5b165f60e0fddfc1dd41ec84dfecf325c966e0549e`。
- 新哈希资源先部署，HTML 最后切换。已有 immutable URL 的文件字节保留；gzip/Brotli 压缩差异经解压确认内容一致后保留原文件。
- 发布后 HTTP 入口与测试构建字节一致，41 个 GLB/头像线上哈希与发布前一致。

## 线上验证

- 真实 7470、正常时钟、真实 WebSocket 输入，不注入服务器状态。
- 硬地、红土、草地各四个客户端完成至少三拍回合，同序列状态一致。
- 第四席断线冻结、原凭证重连、比赛期间场地配置拒绝、补电脑后再赛归零通过。
- 草地案例使用标准一盘，其余案例使用抢七；完整比赛证据另外由合并后的自动测试覆盖。
- 原主线近球普通回击的两个真实发球场景均正常回球，无不必要小跳/补滑窗口。
- 手机尺寸浏览器核验场地选择、红土双打房、三电脑、四人渲染、最新救球帮助，console error 为空。
- 上述不等同于四台真实手机的持续触控手感验收。

## 证据与回滚

主目录 `artifacts/doubles-main-7470-2026-09-30/`：

- `merge-tests.log`、`main-tests.log`、`main-typecheck.log`、`merge-build.log`
- `merge-receipt.json`、`publication.json`、`server.log`
- `assets-before.json`、`asset-readback.json`
- `live-doubles.json`、`nearby/nearby-return.json`
- `browser.json`、`browser-7470.png`
- `source-before.tar`、`dist-before/`

回滚分支：`codex/backup-main-before-doubles-20260930`（`767f7fc`）。
回滚前仍须确认没有活跃房间；不得直接清理原主目录或覆盖进行中的角色修改。

使用地址：`http://100.81.1.29:7470/`（同网设备），或本机 `http://localhost:7470/`。
旧页面需要刷新，已有旧房间需重新创建。
