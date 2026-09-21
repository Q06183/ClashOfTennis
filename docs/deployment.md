# 好友网球部署

## 当前交付边界

源码与本机服务已经具备双人网络对战。尚未部署公网地址，也未完成不同网络的两台手机实测。服务端是内存房间，重启会结束当前房间，适合小范围好友使用。

## 同一 Wi-Fi

1. 在电脑运行 `npm start` 并保持运行。
2. 找到电脑 Wi-Fi 网卡的 IPv4 地址。macOS 可运行 `ipconfig getifaddr en0`，实际网卡名称以系统网络设置为准。
3. 两台手机都打开 `http://电脑地址:7470`，创建/加入同一个房间。
4. 若地址无法打开，检查电脑和手机是否在可互通的同一网络，系统是否允许该 Node 服务接收连接。不要关闭安全防护或绕过网络隔离；可以换到允许设备互通的个人网络。

2026-09-21 再次核验构建机器 Wi-Fi 网卡 en0 地址为 `100.81.1.29`。已从本机通过该地址验证 HTTP 和完整 WebSocket 对局；尚未由真实手机验证；换网后可能变化。`utun` 是 VPN 网卡，不应默认作为 Wi-Fi 邀请地址。

## 异地网络：容器部署

### 托管适配检查（2026-09-20）

检查当前可用的 Sites 托管文档后，暂不直接向其发布此项目。Sites 使用 Cloudflare Workers 运行时，当前声明的资源绑定为 D1/R2；未提供本游戏需要的房间协调实例配置。现有后端使用 Node HTTP/ws、进程内房间表和持续 60 Hz 模拟，不能把静态页面上传成功当作双人服务已部署。

[Cloudflare 官方 WebSocket 文档](https://developers.cloudflare.com/workers/runtime-apis/websockets/)建议通过 Durable Objects 在多个客户端连接间协调状态。如果之后选择 Cloudflare，需要先确认平台允许 Durable Objects 绑定并完成服务端适配；目前没有相应可用部署配置。首版保留已验证的 Node 服务，优先部署到用户已有的单实例 Node/容器宿主。

选择用户已有的、支持 WebSocket 的容器服务器。必须运行单实例；内存房间不能跨多个独立实例随意负载均衡。配置平台对服务持续运行，避免空闲休眠影响正在等待的房间。

```sh
docker build -t rally-club .
docker run -d --name rally-club --restart unless-stopped -p 127.0.0.1:7470:7470 rally-club
```

以上绑定适合使用同一台服务器上的 HTTPS 反向代理。若平台直接管理容器入口，让平台将服务端口映射到 HTTPS 域名，并传入平台需要的 `PORT` 环境变量。

已有 Caddy 的服务器可用以下模板，将域名替换成自己已解析到服务器的实际域名：

```caddyfile
tennis.your-domain.example {
    reverse_proxy 127.0.0.1:7470
}
```

[Caddy 官方 reverse_proxy 文档](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)说明其支持 WebSocket 升级。域名必须实际归用户控制且正确解析，服务器允许 HTTP/HTTPS 入口。此仓库未安装 Caddy、未修改服务器或 DNS，也未采购资源。

不用 Docker 时，在服务器安装 Node.js 22.12+，运行 `npm ci && npm run build && npm start`，使用已有进程管理器保持服务运行，同样配置 HTTPS 代理。tsx 当前位于 devDependencies，执行服务器安装时不要加 `--omit=dev`；Dockerfile 已复制完整运行依赖。

## 公网验收

- `https://实际域名/health` 返回 `ok: true`。
- 页面资源正常加载，浏览器没有混合内容或 WebSocket 错误。
- 一台手机使用 Wi-Fi，另一台使用移动数据；真实创建/加入并完成一场 7 分制比赛。
- 核对双方得分、胜者、发球顺序和结算一致，双方再赛归零。
- 一端刷新，另一端看到暂停，原玩家恢复；中断超过恢复窗口会明确结束比赛。
- 分享的链接必须是已验证的 HTTPS 地址，不能包含 localhost、私人令牌或 VPN 地址。

只有这些验证实际通过，才能把主验收清单的异地好友交付标记完成。
