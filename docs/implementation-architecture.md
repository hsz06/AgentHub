# AgentHub Local Runner Architecture

## Runtime Layout

- `web`: React/PWA 客户端，提供聊天、Artifact、Workspace、审批和部署管理。
- `api`: Express、Socket.io、Prisma、JWT、BYOK 加密和预览代理。
- `worker`: 独立本机进程，消费 CLI Agent、白名单命令和本机项目部署队列。
- `electron`: Web UI 桌面壳，提供目录副本导入、Artifact 导出和通知。

SQLite 和受管 workspace 保存于本机目录。API 与 Worker 必须运行在同一台 Linux 主机。

## Security Boundaries

- 本机 Runner 适用于受信任的本地 Demo，不是操作系统级沙箱，不用于公网多租户部署。
- CLI Agent 只在临时 workspace 副本中运行。文件变化转换为 Diff Approval，批准后才写回正式 workspace。
- Runtime 参数由服务端固定生成。Control Center 只能设置 executable path、启用状态、权限档位和可选 API Key。
- 白名单命令使用固定参数直接执行，不经过 Shell：`npm install`、`npm run build`、`npm test`、`npm run test`、`npm run lint`。
- 本机项目部署仅执行 `npm run start`，要求 `package.json` 包含 `scripts.start`。
- 所有 Agent、conversation、workspace、artifact、approval 和 deployment 查询按 `userId` 隔离。
- Web 预览 iframe 没有同源权限，并使用严格 CSP。

## Local CLI Runtime

Runtime executable path 优先级：

1. 用户保存的 `executablePath`。
2. `CLAUDE_CODE_BIN`、`CODEX_BIN`、`OPENCODE_BIN`。
3. 系统 `PATH` 中的 `claude`、`codex`、`opencode`。

Claude Code 使用 `-p` 非交互执行和 `stream-json` 输出。默认复用本机 OAuth 登录；配置 API Key 时使用独立 Key 覆盖。`readonly` 仅开放读取工具，`safe_write` 开放临时副本中的读取和编辑工具。宿主机模式不允许 `autonomous`。

## Deployment

静态 Web Artifact 发布固定版本，并返回受 Token 保护的预览 URL。

本机项目部署流程：

1. 用户提前审批执行 `npm install`。
2. 创建 fullstack deployment，并审批本机启动。
3. Worker 分配空闲端口，设置 `HOST=127.0.0.1` 和 `PORT`，执行 `npm run start`。
4. Worker 持久化 PID 和日志，等待端口就绪。
5. API 通过受 Token 保护的 runtime proxy 暴露预览 URL。
6. Stop 终止进程组；Redeploy 停止旧进程后重新排队。

## Socket Protocol

客户端事件：`conversation:join`、`message:send`、`message:regenerate`、`orchestration:cancel`。

服务端事件：`message:created`、`message:chunk`、`message:completed`、`orchestration:state`、`task:state`、`tool:approval-created`、`tool:result`、`deployment:state`。
