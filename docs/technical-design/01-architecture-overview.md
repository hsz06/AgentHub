# 01. 总体架构

## 1. 架构目标

AgentHub 的技术架构服务于三个目标：

1. **IM 实时体验**：用户消息、Agent 回复、运行状态和卡片更新需要实时进入聊天流。
2. **多 Agent 统一接入**：模型 API、Claude Code CLI、Codex CLI、OpenCode CLI 的差异必须被 Adapter 屏蔽。
3. **文件变更可控**：任何 Agent 写入都不能绕过 workspace、临时副本、Diff 和审批。

## 2. 系统分层

```text
Frontend
  React + Ant Design + Monaco
  ChatPage / MessageInput / WorkspaceWorkbench / ControlCenter

Realtime API
  Socket.io message:send / message:stop / run updates

HTTP API
  Conversation / Agent / Settings / Workspace / Approval / Artifact / Deployment

Domain Services
  ContextService
  Orchestrator
  AgentRuntime
  CliAgent
  WorkspaceService
  ApprovalService
  ArtifactService
  DeploymentService

Runtime Layer
  Provider API
  Claude Code CLI
  Codex CLI
  OpenCode CLI
  LocalProcessExecutor

Persistence
  PostgreSQL / Prisma
  Workspace files
  Artifact files
```

## 3. 前端模块

|模块|职责|
|---|---|
|`ChatPage.tsx`|会话主页面，协调会话、消息、工作台、控制中心|
|`SessionList.tsx`|会话列表、置顶、归档、删除|
|`MessageInput.tsx`|消息输入、附件、@Agent 提示、快捷命令|
|`MessageFlow.tsx`|消息流、Agent 回复、卡片渲染|
|`WorkspaceWorkbench.tsx`|文件树、文件打开、Monaco 编辑、手工修改审批|
|`ControlCenterModal.tsx`|Provider、CLI Runtime、Workspace、Artifact、Approval、Deployment 管理|
|`AgentContactList.tsx`|内置和自建 Agent 配置|
|`ArtifactEditorModal.tsx`|Artifact 预览、编辑、版本、下载|

## 4. 后端模块

|模块|职责|
|---|---|
|`sockets/index.ts`|处理消息发送、Agent 回复、错误回写和实时推送|
|`ContextService.ts`|构建 Agent 上下文，控制 token 预算|
|`Orchestrator.ts`|群聊任务拆解、分派、状态聚合|
|`AgentRuntime.ts`|模型 Agent 调用入口|
|`agents/CliAgent.ts`|CLI Agent 执行、stdout 解析、Diff 生成|
|`agent-platform/*Adapter.ts`|Claude Code / Codex / OpenCode 参数和输出适配|
|`CliRunWorker.ts`|异步运行 CLI 任务|
|`LocalProcessExecutor.ts`|本机白名单命令和部署进程管理|
|`WorkspaceCommandService.ts`|workspace 命令审批和执行|
|`ArtifactExtractionService.ts`|从消息和运行结果提取 Artifact|

## 5. 数据与文件边界

```text
Database
  User
  Agent
  Conversation
  Message
  Workspace
  ToolApproval
  Artifact
  Deployment
  CliRuntimeConfig
  CliRun

Filesystem
  data/workspaces/*
  data/artifacts/*
  /tmp/agenthub-cli-* temporary workspace
```

数据库记录状态和元数据；正式代码文件保存在 workspace 目录；CLI Agent 运行在临时目录；Artifact 作为独立交付物保存和版本化。

## 6. 关键设计决策

### 6.1 为什么不用 Docker 作为主流程

本机 Demo 的目标是降低运行门槛，并复用用户已经登录的 Claude Code CLI。Docker 方案保留为 legacy，但主流程使用 executable path：

```text
database executablePath
  → CLAUDE_CODE_BIN / CODEX_BIN / OPENCODE_BIN
  → PATH
```

### 6.2 为什么 CLI 修改不直接写正式 workspace

CLI Agent 具有较强文件操作能力。如果直接让它在正式目录中运行，用户很难判断修改范围。临时副本 + Diff 审批可以把风险转为可审查对象。

### 6.3 为什么 Artifact 独立于 Message

Message 是沟通过程，Artifact 是交付物。Artifact 需要版本、下载、预览、发布和导出能力，所以不能只作为消息文本存在。

### 6.4 为什么 Orchestrator 先做规则调度

P0 / P1 阶段优先验证群聊协作链路。规则调度更稳定、可解释，后续可以升级为模型规划。

## 7. 架构主链路

```text
用户输入
  → 前端 MessageInput
  → Socket message:send
  → 后端保存用户 Message
  → 根据会话成员和 mentionedAgentIds 选择 Agent
  → ContextService 组装上下文
  → AgentRuntime 或 CliAgent 执行
  → 保存 / 推送 Agent Message
  → 如有文件变化生成 ToolApproval
  → 如有产物生成 Artifact
  → 前端消息流展示卡片
```
