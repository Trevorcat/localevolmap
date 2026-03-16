# LocalEvomap MCP Skill

Use LocalEvomap through MCP only.

## 任务模式判断 (Task Mode Assessment)

**在使用知识库之前，必须先判断任务模式。**

### 探索性任务 (Exploration)

**特征：**
- 目标是"找出问题"而非"修复问题"
- 每次执行的场景都有独特性（不同的配表、不同的需求）
- 需要验证"规划"与"实现"是否一致
- 发现新问题是任务价值的重要组成部分

**示例：**
- 测试设计、配表检查
- 需求分析、代码审查
- 方案规划、架构设计

**知识使用策略：**
1. **裸奔起步**：前5分钟不查看任何 Gene/Capsule，独立分析
2. **框架借鉴**：知识仅作为检查清单和映射指引
3. **差异优先**：发现与先验知识不符时，**优先信任实际发现**
4. **记录新知**：任何新发现都记录为潜在新 Gene

### 解决性任务 (Resolution)

**特征：**
- 目标是"修复/解决"具体问题
- 相同错误信号通常有相同根因和解决方案
- 快速收敛比探索新方案更重要
- 问题的症状和上下文具有可识别性

**示例：**
- Debug、Bug 修复
- 性能优化、重构
- 错误处理、故障排查

**知识使用策略：**
1. **先查后做**：优先搜索相关 Gene/Capsule
2. **置信度决策**：
   - ≥0.8：直接应用
   - 0.5-0.8：应用但需验证
   - <0.5：视为参考，独立分析后对比
3. **快速收敛**：优先使用验证过的解决方案
4. **事后记录**：修复后记录 Capsule

### 快速判断流程

```
任务开始时，问自己：

1. 这个任务的主要目标是"发现问题"还是"解决问题"？
   → 发现 = 探索模式
   → 解决 = 解决模式

2. 历史方案能否直接套用？
   → 不能/不确定 = 探索模式
   → 可以 = 解决模式

3. 如果应用了错误的知识会有什么后果？
   → 可能掩盖真实问题 = 探索模式
   → 最多只是效率问题 = 解决模式
```

## Core Rules

0. If `get_runtime_status` is available and reports anything other than `ready` or `update_available`, do not assume formal LocalEvomap tools are usable.
1. Start every meaningful task with `start_task`.
2. Read `evomap://workspace/<workspace>/playbook` when workspace-specific guidance would help.
3. Whenever you actually adopt a `Gene` or `Capsule`, call `record_usage`.
4. Before final delivery, decide whether the task is complete.
5. If the task is complete, build a short retrospective and call `finalize_task`.
6. If `finalize_task` returns provenance warnings, report them honestly and prefer fixing missing `record_usage` in future runs rather than hiding them.

The agent decides when a task is complete. Do not ask MCP to infer completion from partial work.

## Bootstrap Rule

- `get_runtime_status` is the bootstrap health probe
- if the status is `unreachable`, `blocked`, `booting`, `updating`, or `update_failed`, treat LocalEvomap formal tools as unavailable
- supported clients may receive automatic skill updates before the server reports `ready`

## Completion Criteria

Treat a task as complete only when all of the following are true:

- the active plan items are complete
- a concrete deliverable or conclusion exists
- no blocker remains
- validation is complete, or the user has explicitly accepted an unvalidated result

## MCP Workflow

### 1. 判断任务模式 (Mandatory)

**在调用任何 MCP 工具之前，先判断任务模式：**

- 如果是 **探索性任务** → 进入步骤 2A（探索流程）
- 如果是 **解决性任务** → 进入步骤 2B（解决流程）

### 2A. 探索流程 (Exploration Path)

**阶段 1：独立探索（至少5分钟）**
- 不查看任何 Gene/Capsule
- 独立分析实际数据/代码/问题
- 形成初步发现

**阶段 2：对照知识**
- Call `start_task` 开启任务追踪
- 查看返回的 recommendations，但**仅作为对照参考**
- 对比先验知识与实际发现，记录差异

**阶段 3：记录新知**
- 如果发现了新的模式/映射关系 → 记录为新 Gene
- 调用 `record_usage` 记录实际参考的知识（如有）
- 任务完成后调用 `finalize_task`，重点关注新发现

### 2B. 解决流程 (Resolution Path)

**阶段 1：搜索知识**
- Call `start_task` with `goal`, `workspace`, `client`, `initialSignals`
- 优先使用返回的 recommendations
- 如果 confidence < 0.5，标记为"低置信度"，需额外验证

**阶段 2：应用与验证**
- 高置信度方案 → 直接应用
- 低置信度方案 → 应用前独立验证
- 知识不匹配 → 独立解决，记录为新的 Capsule

**阶段 3：记录使用**
- 每当真正采用 Gene/Capsule → 调用 `record_usage`
- 任务完成后 → 调用 `finalize_task`，包含 retrospective

### 3. 任务切换时的重新判断

如果任务中途从"探索"转向"解决"（或反之）：
1. 重新评估任务模式
2. 切换到对应流程
3. 更新 `initialSignals` 并重新搜索知识

### 4. Record actual usage

Whenever you truly use a recommendation, call `record_usage` with:

- `taskId`
- `knowledge[]`
- each item containing `kind`, `id`, `phase`, and optional `note`

Only record knowledge that materially influenced the solution.

### 5. Finalize the task

If the agent decides the task is complete, call `finalize_task` with:

- `taskId`
- `summary`
- `outcome`
- `retrospective.signals`
- `retrospective.selfMistakes`
- `retrospective.userCorrections`
- `retrospective.validations`
- `createCapsule`

Use `finalize_task` immediately before the final user-facing delivery.

## Anti-Patterns

### 通用反模式

- Do not call LocalEvomap HTTP APIs directly from the agent path.
- Do not build ad hoc feedback payloads outside MCP.
- Do not record knowledge usage if you only glanced at a recommendation.
- Do not finalize a task that still has unresolved blockers.

### 任务模式反模式

**探索性任务的反模式：**
- ❌ 直接套用历史解决方案（掩盖了本次的独特性）
- ❌ 高置信度自动应用（跳过了独立验证）
- ❌ 假设"上次这样，这次也一样"（没有独立分析）
- ❌ 看到相似信号就直接用对应 Gene（忽略了差异）

**解决性任务的反模式：**
- ❌ 独立重新分析已知问题（低效重复）
- ❌ 忽略高置信度的推荐（不信任知识库）
- ❌ 不记录使用情况（无法反馈优化）
- ❌ 发现已有 Capsule 还重新探索（浪费资源）

**模式混淆的反模式：**
- ❌ 探索性任务使用解决模式（会错过新问题）
- ❌ 解决性任务使用探索模式（低效重复已知工作）
- ❌ 任务中途模式切换后没有重新搜索知识
