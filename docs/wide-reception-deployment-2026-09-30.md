# 外角接球修复合并 main 与 7470 部署

## 合并

- 本地 main 从 `90903eb` 快进到 `9090dd1497154567d95092e2e9fe1a193de5dd19`。
- 推送 `origin/main` 成功，远端 SHA 已读回核对。
- 没有覆盖或提交原有电脑换人 UI、对应测试和主清单等未提交内容。
- 回滚分支 `codex/backup-main-before-wide-deploy-20260930` 保留原 main。

## 发布组成与验证

- 服务端/主体代码来自 `9090dd1` 固定快照。
- 线上先前已具有未提交的电脑换球员功能；为避免回退，候选额外复制
  `src/ui/app.ts`、`src/ui/characters.ts`、`src/ui/match-settings.ts`，并带上对应测试。
  该 UI 附加内容仍保持工作区未提交状态，没有冒称发布包完全等于 Git main。
- 完整发布候选 **623/623 测试通过**，`npm run build`（类型检查、Vite、压缩）通过。
- 旧 GLB 测试依赖从本机 ignored 原始夹具复制；历史模型测试只读原仓库 Git objects。
- 发布前逐文件核对源码与测试快照，拒绝并发修改。

## 安全切换

- 发布前 `/health` 确认 0 房间，原服务 PID `46760` 正常 SIGTERM 退出。
- 新服务 PID `2080`，加载固定源码：
  `artifacts/wide-reception-deploy-2026-09-30/release-source/`。
- 服务监听 `0.0.0.0:7470`，静态目录仍为主仓库 `dist/`。
- 新哈希资源先写入，保留旧 immutable 资源；压缩资源如名称相同须解压字节一致。
- 停止旧服务后切换 HTML/gzip/Brotli，再启动新服务；失败会自动恢复旧 HTML 和旧服务快照。
- 入口：`/assets/index-rPt4sdZR.js`。
- SHA-256：`ab4ddce21a74b632c51b5606bcc8754f25e915205bd471e863748fa96b96beac`。
- 本机与 Wi-Fi 地址回读入口字节一致；41 个模型/头像文件与发布前完全一致。

## 线上验收

- `scripts/verify-wide-reception-live.ts`：真实双 WebSocket、正常计分切换，
  无服务器状态注入；两侧移动目标 ±8 米，实际位置约 ±7.96 米，双方快照一致。
- 连续两分对角底角暴击发球均由接发方普通回击，无侧扑；实际触点与双方相同 seq 验证通过。
- 原近球回击脚本两个站位场景均通过，没有引入不必要的侧扑。
- 390×844 浏览器实际打开线上双打，添加三电脑、把队友换为梅岚、开赛并确认四人状态；
  自己的荧光环/箭头可见，页面错误为空。
- 检查后测试客户端均主动离开；空房间按服务器原有回收时限清理，没有为清理测试房重启服务。
- 以上不是实体手机持续触控验收。

## 使用与回滚

- 本机：`http://localhost:7470/`。
- 同 Wi-Fi 手机：`http://192.168.31.74:7470/`（后续网络变化时以实际网卡地址为准）。
- 旧网页请刷新，重新开房。
- 证据目录 `artifacts/wide-reception-deploy-2026-09-30/`：
  `release-tests.log`、`release-build.log`、`publication.json`、`live/wide-reception.json`、
  `nearby/nearby-return.json`、`browser.json`、`browser-lobby.png`、`browser-match.png`。
- 回滚物料：`dist-before/`、`rollback-source/`、`working-before.patch`。
  回滚须先检查房间；从旧服务快照启动并恢复旧 HTML，不覆盖工作区未提交文件。
