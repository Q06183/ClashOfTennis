# 球员选择后自动展示属性

## 交互调整

- 点击球员卡片（包括当前已选球员）后，先更新介绍，再自动滚动到属性区域；适用于自己、练习对手和房间电脑席位。
- 保留点击前的面板滚动位置作为动画起点，避免重绘后先跳回顶部；开启“减少动态效果”时直接定位。
- 属性区域可接收程序化焦点并带球员名称，键盘选人后继续 Tab 可进入“返回球员列表”。
- 新增“返回球员列表”，直接定位并聚焦当前选中的卡片，不重绘、不修改选择。
- 初次打开、解锁或普通重绘不强制滚动，仍先展示列表。
- 自己选人产生的房间广播不再关闭选择页，避免阅读属性时突然返回房间。电脑草稿、确认/取消和目标席位失效处理保持原行为。

## 验证

- 新增 `tests/character-picker-navigation.test.ts`：6 项回归，覆盖三种选人上下文、重复选人、隐藏角色、键盘焦点、减少动画、返回列表与联机回显。
- 当前工作区全量测试 **629/629 通过**；`npm run build`（含 TypeScript 检查）通过；`git diff --check` 通过。
- Chromium 实际页面验证：390×844、320×568、1440×900，点击后标题和六项属性均在面板可视范围，无横向溢出。
- 实际页面验证练习对手、键盘 Enter/Tab、返回列表、减少动画，以及双打房间电脑确认/取消、本人选人后同步消息不会关闭属性页；无 pageerror。
- 浏览器报告：`artifacts/character-picker-navigation-browser.json`。
- 截图：`artifacts/character-picker-mobile.png`、`character-picker-small-phone.png`、`character-picker-desktop.png`。

## 7470 发布与提交

- 用户确认提交并更新 7470 后，将原已在线但未提交的电脑选人功能独立提交为 `51b6ca7`，本次自动展示属性及其测试、发布记录另作提交；未推送远端。
- 更正前一轮的发布边界：7470 后端从 `artifacts/wide-reception-deploy-2026-09-30/release-source` 运行，但静态根目录按进程 cwd 解析为项目 `dist`。因此前一轮原地构建已经更新了在线前端，不能仅凭后端快照路径判断静态页未更新。
- 本轮在 `artifacts/character-picker-deploy-2026-10-08/dist` 隔离重建，再重新全量验证 **629/629**。核对 `server` 与 `src/simulation` 和运行快照逐文件相同，因此只发布前端、无需重启。
- 发布入口 `/assets/index-DeZBH74Z.js`；样式 `/assets/index-ltPbTyqc.css`。47 个在线文件经 HTTP 回读与构建逐字节一致；HTML、入口 JS、CSS 的 identity/gzip/Brotli 均校验通过。
- 从上次发布快照和旧资源备份恢复历史 immutable 资源，不删除旧资源；新依赖先就位，三份 HTML（普通/gzip/Brotli）最后分别原子替换。历史压缩文件若压缩字节不同，则验证解压内容一致并保留已存在文件。
- 服务 PID **2080** 未变化，发布前后健康检查正常、发布时零房间。之后在真实 7470 页面验证：390×844、320×568、1440×900；自己、练习对手、电脑草稿；返回列表；键盘 Enter/Tab；减少动画；收到本人选人广播后属性页仍保持；电脑确认与取消均正确。浏览器无 pageerror 或 HTTP 4xx/5xx。
- 浏览器测试客户端已主动离开房间；不为清理空房间重启服务，按服务器回收时限清理。
- 本机访问 `http://localhost:7470/`，当前网卡地址 `http://100.81.20.64:7470/`；刷新旧页面获取新版。浏览器尺寸模拟不等同实体手机验收。

证据目录：`artifacts/character-picker-deploy-2026-10-08/`，包含 `tests.log`、`publication.json`、`browser.json`、`mobile.png`、`small-phone.png`、独立构建 `dist/`。`html-before/` 保留本轮发布前入口（已是前轮构建的新 UI），真正的上一功能版本回滚入口在 `rollback-html/`。仅前端回滚时恢复其三份 `index.html*` 即可，所需历史依赖已恢复，无需改动后端进程。
