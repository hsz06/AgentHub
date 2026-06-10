# 03. Runtime、安全边界与数据模型

## 1. 数据模型概览

|模型|作用|
|---|---|
|User|Demo 用户和配置归属|
|Agent|内置 Agent、自建 Agent、CLI Agent|
|Conversation|单聊 / 群聊会话|
|Message|用户和 Agent 消息，包含状态和 metadata|
|Workspace|受管本机项目目录|
|ToolApproval|文件写入、命令执行、部署启动审批|
|Artifact|可预览 / 下载 / 版本化的产物|
|Deployment|静态或本机 Node 预览运行记录|
|CliRuntimeConfig|Claude Code / Codex / OpenCode 本机运行配置|
|CliRun|CLI 执行日志、退出码、stdout / stderr|

## 2. Workspace 边界

正式 workspace 是用户要保护的项目目录。AgentHub 对它的操作必须分层：

```text
Read
  前端工作台和 Agent 可以读取受管 workspace 文件。

Propose
  Agent 或手工编辑生成修改提案。

Approve
  用户确认 Diff 或命令。

Apply
  后端服务把批准后的内容写回正式 workspace。
```

不允许：

- CLI Agent 直接在正式 workspace 中执行写操作。
- 未审批命令修改依赖或启动部署。
- 任意 shell 命令进入执行器。

## 3. 本机 Runner 安全边界

本机 Runner 是可信 Demo 边界，不是生产级沙箱。它提供的是工程约束：

- 临时 workspace 副本。
- 权限档位。
- 命令白名单。
- 超时限制。
- 最小环境变量。
- Diff 审批。
- 日志记录。

它不提供：

- 强隔离内核。
- 多租户资源限制。
- 恶意代码逃逸防护。
- 网络访问完全隔离。

生产化方向应该替换为远程 Runner、容器、Firecracker 或 Kubernetes Job。

## 4. CLI Runtime 配置

配置优先级：

```text
database executablePath
  → environment variable
  → system PATH
```

环境变量：

```env
LOCAL_EXECUTION_ENABLED="false"
CLAUDE_CODE_BIN="/home/hsz/software/node/bin/claude"
CODEX_BIN=""
OPENCODE_BIN=""
NPM_BIN="npm"
```

Runtime Test：

```text
<binary> --version
```

Claude Code 默认复用本机 OAuth 登录状态，不强制 API Key。

## 5. Provider 配置

Provider 配置服务于自建模型 Agent：

- Provider 名称
- Base URL
- API Key
- 默认模型
- 是否启用

CLI Agent 的模型由外部 CLI 自己管理，AgentHub 只负责 executable path、权限和运行日志。

## 6. 命令执行 allowlist

允许命令：

```text
npm install
npm run build
npm test
npm run test
npm run lint
```

执行要求：

- 使用 `execFile` 固定参数。
- `cwd` 必须是受管 workspace。
- 不经过 shell。
- 有超时。
- 使用最小环境变量。
- 命令执行前必须审批。

## 7. 文件审批类型

|审批类型|说明|
|---|---|
|`apply_diff`|应用 Agent 或手工编辑生成的文件修改|
|`run_command`|执行白名单命令|
|`deploy_workspace`|启动本机 Node 项目预览|
|`publish_artifact`|发布静态 Artifact|

审批记录应该包含：

- 标题
- 类型
- workspaceId
- payload
- 创建者
- 状态
- 审批人
- 审批时间

## 8. 答辩代码索引

|问题|建议讲解入口|
|---|---|
|消息如何触发 Agent|`backend/src/sockets/index.ts`|
|上下文如何构建|`backend/src/services/ContextService.ts`|
|群聊如何调度|`backend/src/services/Orchestrator.ts`|
|CLI 如何运行|`backend/src/services/agents/CliAgent.ts`|
|Claude Code 如何适配|`backend/src/services/agent-platform/ClaudeCodeAdapter.ts`|
|审批如何写回|`backend/src/controllers/ApprovalController.ts`|
|Artifact 如何预览|`frontend/src/components/ArtifactEditorModal.tsx`|
|工作台如何编辑文件|`frontend/src/components/WorkspaceWorkbench.tsx`|
|控制中心如何配置 Runtime|`frontend/src/components/ControlCenterModal.tsx`|

## 9. 风险与应对

|风险|应对|
|---|---|
|CLI 输出格式变化|Adapter 层解析，失败时记录原始 stdout / stderr|
|模型上下文被截断|ContextService 控制 token 预算并保留当前消息|
|工作区未绑定|CLI Agent 执行前阻断并给出用户提示|
|审批绕过|所有写入入口统一走 ToolApproval|
|本机部署端口冲突|Worker 自动分配空闲端口|
|UI 内容溢出|布局使用局部滚动和窄屏降级|
|生产安全不足|文档明确本机 Demo 边界|
