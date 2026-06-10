# 02. 核心流程设计

## 1. 消息发送流程

```text
MessageInput
  → conversationsApi / socket message:send
  → create user message
  → resolve mentionedAgentIds
  → create assistant placeholder
  → run agent
  → stream / update assistant message
  → mark completed or failed
```

关键点：

- 用户消息必须先持久化，再触发 Agent。
- Agent 失败时要更新消息状态为 `failed`。
- `@AgentName` 解析保持前后端一致。
- 群聊中未被 @ 的 Agent 是否响应，由 Orchestrator 和会话策略决定。

## 2. 上下文构建流程

```text
Conversation
  → recent messages
  → pinned messages
  → workspace summary
  → agent system prompt
  → token budget trimming
  → provider messages
```

ContextService 的目标不是把所有历史都塞给模型，而是在预算内保留最有价值上下文：

1. system prompt
2. 用户当前消息
3. pin 的关键消息
4. 最近多轮对话
5. workspace 绑定状态

已知风险：不同模型 token 预算不同，因此需要保守预留输出 token，避免出现空 `messages` 数组。

## 3. 单 Agent 流程

```text
用户 → 单聊会话 → 目标 Agent → AgentRuntime / CliAgent → 回复
```

适用场景：

- 快速问答
- 单文件修改
- README / 文档生成
- 让 Claude Code CLI 在 workspace 中完成明确任务

验收点：

- 单聊标题显示 Agent 名称和状态。
- Agent 回复进入同一会话。
- CLI Agent 无 workspace 时提示绑定。

## 4. 群聊 Orchestrator 流程

```text
用户复杂任务
  → Orchestrator 读取会话成员和能力标签
  → 拆分 OrchestrationTask
  → 分派给子 Agent
  → 子 Agent 执行
  → Orchestrator 聚合结果
  → 聊天流显示汇总
```

调度原则：

- 前端相关任务优先给前端 Agent 或 Claude Code。
- 后端相关任务优先给后端 Agent。
- 测试、验收、文档任务分派给对应自建 Agent。
- 文件写入和命令执行保留审批。
- 子任务失败时记录失败，不让整个 run 静默卡死。

## 5. CLI Runtime 流程

```text
CliRuntimeConfig
  → resolve executablePath
  → build adapter args/env
  → copy workspace to /tmp
  → spawn CLI process
  → parse JSON Lines / stdout
  → detect file diff
  → create approval
  → cleanup temporary workspace
```

Claude Code 参数约束：

```text
-p
--output-format stream-json
--no-session-persistence
```

安全约束：

- 不使用 shell 字符串拼接。
- 不开放任意 Bash。
- `readonly` 只允许读工具。
- `safe_write` 允许 Read / Glob / Grep / Edit / Write。
- 本机模式拒绝 `autonomous`。

## 6. Diff 审批流程

```text
Temporary workspace changed files
  → compare with original workspace
  → build oldCode / newCode / patch summary
  → create ToolApproval(type=apply_diff)
  → show Diff card
  → user approve
  → write to official workspace
```

必须保证：

- 审批前正式 workspace 不变。
- Diff 卡片有真实前后内容。
- 批准后重新读取文件 hash。
- 冲突时不强行覆盖，应提示用户处理。

## 7. Artifact 流程

```text
Agent output / user action
  → ArtifactExtractionService
  → Artifact metadata
  → ArtifactVersion content
  → Preview / Edit / Download / Publish
```

类型策略：

|类型|预览|编辑|主要操作|
|---|---|---|---|
|web|sandbox iframe|桌面可编辑 HTML|发布、下载|
|document|Markdown 渲染|桌面可编辑 Markdown|保存版本、下载|
|slides|只读预览|桌面表单编辑|PPTX 导出|
|code|源码只读|一般不直接编辑 Artifact|下载|
|attachment|按附件处理|不可编辑|下载|

## 8. 本机部署流程

```text
Deployment request
  → create approval
  → user approve
  → LocalProcessExecutor
  → npm run start
  → wait for port ready
  → proxy URL
  → logs / stop / redeploy
```

约束：

- workspace 必须有 `package.json`。
- 必须有 `scripts.start`。
- Worker 自动分配端口。
- 设置 `HOST=127.0.0.1` 和 `PORT`。
- Stop 使用 PID 终止进程组。

## 9. 控制中心流程

Control Center 不只是设置页，而是 Demo 的运维台：

- Provider：配置自建 Agent 的模型服务。
- CLI Runtime：配置 Claude Code / Codex / OpenCode executable path。
- Workspace：管理项目目录、绑定会话、导入导出。
- Artifact：预览、编辑、下载和发布。
- Approval：批准或拒绝文件、命令、部署操作。
- Deployment：查看预览 URL、日志、停止、重部署。
- Runs：查看 CLI Agent 运行历史。
