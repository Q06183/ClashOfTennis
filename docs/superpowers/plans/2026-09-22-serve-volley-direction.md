# 发球转体、低位截击与方向一致性

用户已明确授权三项修订，直接按本计划实施。

- [x] 专业动作参考：阅读 Federer 实拍分解、一区/二区运动学研究。相同持拍手，分别调整站姿朝向、转肩幅度和脚位；蹬地时肘保持抬高，拍头在背侧下落，再向上展开，不能手腕孤立翻转。采用原创动画关键帧，不冒充真人动捕。
- [x] 先补失败回归：两区姿态不能完全相同；肩线转动明显且先于挥拍；落拍时握拍手在肩旁、拍头在手下/身体后方；保持连续性、握拍净空与真实触球。
- [x] 低位凌空球：普通回合球只要未落地且实际拍面可达，允许低至球半径上方的触球；不要因固定0.25m高度或一步物理更新跳过窗口。接发仍须先落地。自动目标和救球预测共用条件，远处截击按后场距离与低球程度减速、缩短深度，不给予暴击球质。
- [x] 发球方向：已有诊断显示屏幕滑动斜率0.3，实际前0.1秒球路斜率仅0.089。抽出模拟共用飞行时长函数，通过实际初段弹道反求发球横向方向，保留球速等级/角色/体力/上旋/反向发球一致性。用两端两区、多屏尺寸与真实Match验证。
- [x] 真实GLB多角度预览、完整回归、构建、双客户端协议验证、更新7470服务、更新主清单并提交推送。

参考：
- https://www.feeltennis.net/roger-federer-serve/ （作者获授权的 Federer 实拍与分解）
- https://old.tennisplayer.net/members/avancedtennis/john_yandell/federer_serve/serve_locations/1st_serve_deuce_court/ （原创高速摄影分析）
- https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0252650 （14名精英青少年、双区8机位动捕研究，不当作所有职业球员模板）

实施顺序：截击失败用例→判定/质量修复→真实发球方向失败用例→共用飞行求解→动画失败用例→动作与GLB复核→完整验证。命令：`node --import tsx --test tests/low-volley.test.ts tests/serve-direction.test.ts tests/serve-flow.test.ts tests/professional-clearance.test.ts`；`npm test`；`npm run build`。
