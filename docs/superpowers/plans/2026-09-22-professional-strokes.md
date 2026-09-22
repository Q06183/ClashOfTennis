# Professional strokes implementation plan

**Goal:** 独立全身击球动作、自然发球以及约两倍近景，保留权威触球。
**Architecture:** shared serve motion controls toss and timing; stroke-body drives body/feet/free hand; strokes drives distinct racket paths; Athlete retargets both with impact IK. Camera is presentation only.
**Tech Stack:** TypeScript, Three.js, Rapier, Node/ws.

- [x] 发球：新增 tests/professional-strokes.test.ts 测释放/顶点/触球连续；src/simulation/serve-motion.ts 统一1.2秒发球与高度轨迹，Match和播放共用。
- [x] 全身动作：新增 src/render/stroke-body.ts，测试发球侧身脚距、先屈膝后离地、前脚先落地，切削/正手自由手与重心不同；接入player.ts，对非持拍手、脚、骨盆、倾斜和拍面内旋分别驱动。
- [x] 球拍：strokes.ts 独立发球/高压，切削前送延伸，正反手落拍/过肩；实际拍面与双手握拍检查，保持后退保护。
- [x] 近景：camera.ts 低位更近跟随；camera.test.ts 实测同点球员/基线局部尺寸约2倍，双边和极限站位可见，方向投影正确。
- [x] 真实模型动作逐项浏览器慢放；修正视觉问题，六模型各阶段边界检查，独立审查。
- [x] 全套测试、构建、服务/联机、主清单与证据，保存提交并推送。

复现/验证命令：`node --import tsx --test tests/professional-strokes.test.ts tests/strokes.test.ts tests/camera.test.ts`；模型检查`node --import tsx --test tests/generated-athlete.test.ts`；最终`npm test && npm run build`。

完成证据见 docs/verification.md 的2026-09-22条目；156/156自动回归、正式构建、实际GLB与390×844页面检查、本机双客户端7:1完赛和再赛通过。真人手机动作自然度仍需试玩反馈。
