# AgentHub

AgentHub 是一个本机运行的多 Agent 协作工作台。它提供认证后的实时聊天、受管项目工作区、可编辑产物、人工审批关卡、本机 Coding Agent Runtime、静态发布、本机 Node 项目预览、PWA 支持和 Electron 桌面端容器。

交付文档包括：[技术架构设计](AgentHub-技术架构设计.md)、[实现架构](docs/implementation-architecture.md)、[验收证据清单](docs/acceptance-checklist.md)、[完成度审计](docs/completion-audit.md)、[AI 协作开发记录](docs/ai-collaboration-record.md)、[3 分钟 Demo 路线](docs/demo-script.md)、[Demo 视频脚本](docs/demo-video-script.md) 和 [3 分钟 Demo 视频](docs/demo-video/AgentHub-3min-demo.mp4)。

## 环境要求

- Node.js 20 或更高版本，并确保 `node`、`npm` 在 `PATH` 中。
- Claude Code CLI 用于 Claude Code Runtime。本机已登录时可直接复用 OAuth，无需复制 CLI 到项目目录。
- 本机 Runner 仅适用于受信任的本地 Demo，不是操作系统级沙箱，不适合公网多租户部署。

## 快速启动

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run prisma:seed
npm run smoke:demo
npm run preflight:local
npm run dev
```

API 启动后可运行交付链路冒烟检查：

```bash
cd backend
npm run smoke:delivery
```

另开终端启动独立 Worker：

```bash
cd backend
npm run build
npm run worker
```

修改 Worker 源码时可以使用 `npm run worker:dev` 热重载。热重载会中断正在运行的 CLI 任务，不要将它用于稳定 Demo。

API 和 Worker 都启动后，可以在第三个终端跑端到端本机部署冒烟检查：

```bash
cd backend
npm run smoke:runtime
npm run smoke:realtime
```

另开终端启动 Web：

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

打开 `http://localhost:5173`。Seed 演示账号为 `demo@agenthub.local` / `AgentHub123!`。

## 本机 Coding Agent Runtime

打开 **Control Center > CLI Runtimes**，配置本机可执行文件路径并启用 Runtime。默认路径优先级为：数据库配置、后端环境变量、系统 `PATH`。

```env
LOCAL_EXECUTION_ENABLED="true"
CLAUDE_CODE_BIN="/home/hsz/software/node/bin/claude"
CODEX_BIN=""
OPENCODE_BIN=""
NPM_BIN="npm"
```

Claude Code 默认使用当前主机 OAuth 登录，也可以在控制台设置独立 API Key 覆盖。CLI 只会操作临时 workspace 副本，完成后创建 Diff Approval；用户批准后才写回正式 workspace。

## 模型供应商

Control Center 支持 OpenAI、Anthropic 和 MiMo。用户录入的密钥以加密形式保存；后端环境变量可作为本地默认值。

- `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`
- `ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`
- `MIMO_API_KEY`、`MIMO_BASE_URL`、`MIMO_MODEL`

## 审批与预览

- 文件写入、白名单命令和部署启动都需要审批。
- 白名单命令固定为 `npm install`、`npm run build`、`npm test`、`npm run test`、`npm run lint`，Worker 不执行任意 Shell。
- 静态 Web Artifact 可以生成受 Token 保护的预览 URL。
- 本机项目预览要求 workspace 包含 `package.json` 和 `scripts.start`。先通过审批运行 `npm install`，再点击 **Start locally**。
- Web Artifact 预览运行在无同源权限 iframe 中，并应用严格 CSP。

## 桌面端

```bash
cd electron
npm install
npm start
```

Electron 提供本地目录副本导入、Artifact 导出和系统通知。

## API 概览

- `/api/settings/providers` 和 `/api/settings/providers/:provider/test`
- `/api/settings/cli-runtimes` 和 `/api/settings/cli-runtimes/:runtimeType/test`
- `/api/agent-runs`、`/:runId`、`/:runId/events`、`/:runId/cancel`
- `/api/workspaces`、`/:id/tree`、`/:id/file`、`/:id/import`、`/:id/export`
- `/api/artifacts`、`/:id/versions`、`/:id/download`、`/:id/export/pptx`
- `/api/approvals/:id/resolve`
- `/api/deployments`、`/:id/logs`、`/:id/stop`、`/:id/redeploy`

## 验证

```bash
cd backend
npx prisma validate
npx prisma generate
npm run build
npm run smoke:demo
npm run preflight:local

cd ../frontend
npm run build
```

需要 API 运行的交付链路检查：

```bash
cd backend
npm run dev

# 另开终端
cd backend
npm run smoke:delivery
```

旧 Docker 交付文件已归档到 `legacy/docker/`，不属于当前默认运行路径。
