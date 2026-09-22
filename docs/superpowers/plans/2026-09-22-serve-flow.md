# Continuous serve animation implementation plan

**Goal:** 消除发球分段停顿、落拍翻转和触球/随挥切换，形成连贯的全身动作。
**Architecture:** 保留1.2秒权威发球和2.65m触球点；完整发球使用同一时间轴，连续斜率的限幅三次曲线驱动球拍、躯干、脚和自由手，IK保留接触约束。随挥延长至0.72秒，逐渐交回跑动。仅优化发球。
**Tech Stack:** TypeScript / Three.js / Rapier / Node WebSocket。

依据：TopSpin开发者公开流程为视频参考→真人整套动捕→动画师整理→握拍/触球检查→引擎内复核；Tennis Clash公开资料确认骨骼适配/动画和技术验证，未确认动捕。本轮是原创连续关键帧动画，不宣称获得真人动捕数据。沿用六个GLB，无新增生成或购买。

- [x] 补充失败回归：发球关键帧前后速度连续，触球到随挥同一相位，抛球释放速度连续，回正不突跳。
- [x] 新增render/motion-curve.ts：连续斜率的shape-preserving Hermite曲线，端点平滑停止，中间保留通过速度，不越过作者设定的标量范围。
- [x] render/strokes.ts将serve专用曲线统一到完整phase，增加落拍中间轴向避免正反向归一化翻转；src/simulation/serve-motion.ts定义统一恢复时长/phase和连续抛球释放，match使用共享时长。
- [x] stroke-body.ts中发球使用连续曲线，重新定时蹬地、侧倾转换、收抛球臂、前脚落地和后腿回收；player.ts将发球退出平滑交给正常站姿/步态。
- [x] 实际GLB前/侧/游戏背视角、正常速度和慢放逐帧检查；穿头/穿胸、身体边界、球拍真实接触、左右座位与网络过渡回归。
- [x] 全套测试、构建、7470更新与协议冒烟、独立审查；主清单/验证文档记录证据，提交并推送。

验证命令：`node --import tsx --test tests/serve-flow.test.ts tests/professional-clearance.test.ts tests/professional-strokes.test.ts`；`npm test`；`npm run build`。视觉自然度不能由自动测试替代。

研究来源：[TopSpin 2K25 制作访谈](https://news.xbox.com/en-us/2024/04/03/signature-gameplay-animations-for-topspin-2k25/)、[Tennis Clash 开发日志](https://wildlifestudios.com/games/tennis-clash/news/on-the-court-dev-blog-3/)。最终验证见主清单与 verification.md 2026-09-22 发球连续性章节。
