# M8-19 codex-pet-studio 机器质量对照（2026-09-28）

## 任务定义

两条路径使用同一份冻结提示，针对本地真实项目 `codex-pet-studio` 设计 staging 包合同回归审计。任务明确要求只读、不联网、不安装、不修改项目、不写入 `~/.codex/pets`，并要求区分历史证据、本轮未执行项、未知项和停止条件。

本轮比较的是**计划与判定质量**，不是实际图片质量。两条路径都没有重新读取图片，也没有执行审计命令。

## 两条路径

- **A：直接 GPT/Codex 单次调用**
  - 模型：`gpt-5.6-luna`
  - 认证：subscription
  - CLI 墙钟：`167948ms`
  - JSONL：4 行，1 条 agent message
  - 项目文件读取：提示禁止；没有工具调用
  - 输出：自然语言 Markdown

- **B：Local Agent Workspace**
  - Run：`run_mukw5aif`
  - Provider：`openai-codex` / `codex-managed-session`
  - 认证：subscription，`isMock=false`
  - Run 行 `created_at→completed_at`：`56018ms`
  - Provider events：5 条
  - Receipt：`run_mukw5aif:codex:segment:1`
  - 输出：自然语言 Markdown，但通过 Workspace Run、事件和 receipt 持久化
  - Computer Use 回读：页面显示最新 Run、5 个事件、receipt 和完整输出

## 内容对照

| 维度 | A：直接单次调用 | B：Workspace |
|---|---|---|
| 范围边界 | 正确保留只读、未安装、未发布和不写宠物目录 | 正确保留同样边界，并单独强调不覆盖安装、运行时和发布 |
| 历史/本轮区分 | 明确指出历史 PASS 不能代替本轮验证 | 同样明确，并把“当前包版本不可追溯”列为 PARTIAL 风险 |
| 检查颗粒度 | 8 个主要步骤，覆盖文件、元数据、图集、像素、视觉、逐帧、放大和约束 | 12 个步骤，把网格、透明格、视觉、武器、逐帧、预览和约束拆得更细 |
| 判定规则 | PASS/PARTIAL/FAIL 清晰，并允许 BLOCKED | PASS/PARTIAL/FAIL 更具体，明确无当前 staging 证据时不得 PASS |
| 未知项 | 覆盖当前包、像素、视觉和历史版本关联 | 覆盖同样未知，并增加可信基准缺失和版本指纹问题 |
| 停止条件 | 边界越权、依赖安装、无法读图、无法确认对象时停止 | 同样停止，并明确把证据不足写成 BLOCKED/PARTIAL |
| 可追溯性 | 仅有 CLI 原始 JSONL 和 Markdown | 有 SQLite RunEvent、Provider receipt、Run id 和 Computer Use 可见回读 |
| 内容质量结论 | 质量合格，偏简洁 | 质量合格，检查项更细，适合直接转成执行清单 |

## 机器结论

1. **两条路径都正确理解了任务边界，没有把历史 PASS 伪装成本轮 PASS。**
2. **Workspace 输出在检查颗粒度和可追溯性上更强。** 它把单格网格、视觉闸门、武器形制和逐帧稳定性拆成独立检查项，并且保留 Run、事件和 receipt。
3. **直接调用输出更适合快速草拟。** 它的步骤更少，但仍覆盖了关键质量闸门；要进入正式项目，还需要人工或程序把 Markdown 映射成固定字段。
4. **不能把 B 的更细结果归因于“Workspace 一定更聪明”。** A 使用 `gpt-5.6-luna`，B 使用 `codex-managed-session`，模型路由不同；本轮只能说明 Workspace 的执行与证据层更完整。
5. **没有证明图片合同已通过。** 两条路径都只是生成审计方案，本轮实际 staging 包审计仍未执行。

## 决策

继续使用 Workspace 的结构化单 Bot/Codex 路径作为正式默认。多 Bot 暂不作为默认，因为本轮没有测出多 Bot 的质量收益或人工修改量收益。

## 下一步

在同一只 staging 包、同一版本指纹和只读边界下，执行真正的 8/12 项合同回归审计：读取 `pet.json` 和 `spritesheet.webp`，记录尺寸、网格、57/15 格计数、颜色、alpha、WebP 往返和视觉检查结果。报告必须输出 `PASS`、`PARTIAL`、`FAIL` 或 `BLOCKED`，不得沿用历史 dry-run 结论。
