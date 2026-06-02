# AgentHub

AgentHub 是一个多用户、多 Agent 协作工作台。它提供认证后的实时聊天、受管项目工作区、可编辑产物、人工审批关卡、沙箱部署、PWA 支持，以及 Electron 桌面端容器。

## 快速启动

```bash
docker compose up --build
```

打开 `http://localhost:8080`。Seed 演示账号为 `demo@agenthub.local` / `AgentHub123!`。

在共享环境前，请设置强度足够的 `JWT_SECRET` 和 `ENCRYPTION_KEY`。模型供应商 API Key 可以由每个用户在界面中录入，并以加密形式保存。用于本地冒烟测试或单用户演示时，也可以通过后端环境变量提供供应商 endpoint/model/key；数据库中的 BYOK 配置优先级高于环境变量。

## 模型供应商

控制中心支持：

- `OpenAI`：使用配置的默认 OpenAI 兼容端点。
- `Anthropic`：使用原生 Anthropic 适配器。
- `MiMo`：通过 OpenAI-compatible 端点 `https://token-plan-cn.xiaomimimo.com/v1` 接入，默认模型为 `mimo-v2.5-pro`。

在 **Control Center > Providers** 中录入密钥，然后点击 **Test** 进行最小连接检测。应用不会在 API 响应中返回明文密钥。

环境变量名称：

- `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`
- `ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`
- `MIMO_API_KEY`、`MIMO_BASE_URL`、`MIMO_MODEL`
- 外部 CLI Runtime 使用独立密钥：`CLAUDE_CODE_API_KEY`、`CODEX_CLI_API_KEY`、`OPENCODE_API_KEY`

## 外部 Agent Runtime

P0 阶段的外部 Coding Agent 支持通过统一 Agent Runtime Adapter 层接入 Claude Code 和 Codex。启用这些 runtime 前，需要先构建可选 runner 镜像：

```bash
docker build -t agenthub-cli-claude-code:latest -f docker/cli/claude-code.Dockerfile .
docker build -t agenthub-cli-codex:latest -f docker/cli/codex.Dockerfile .
```

然后打开 **Control Center > CLI Runtimes**，启用对应 runtime，设置其独立 API Key，并使用 **Test** 验证。Claude Code 默认使用 headless stream JSON 命令；Codex 默认使用 `codex exec --json` 和 workspace-write 沙箱。CLI 运行只会操作临时工作区副本，并把文件变更转换为正式工作区的 Diff 审批。

## 已交付流程

- JWT 认证、加密 BYOK 模型供应商配置，以及按用户隔离的 REST/Socket 资源。
- 真实流式聊天、结构化 Agent 提及、消息 Pin、引用、重新生成和取消事件。
- 群聊编排运行，支持持久化的逐 Agent 子任务与流式任务状态。
- Claude Code、Codex CLI、OpenCode 的外部 CLI Agent runtime 框架。CLI run 在 worker 沙箱中针对临时工作区副本执行，再将文件变化转换为审批。
- 受管工作区，支持 ZIP 导入/导出、目录浏览、文件读取、修订记录和冲突审批处理。
- Web、代码、Markdown 和 Slides 内容的 Artifact 版本管理，支持产物下载和 Slides `.pptx` 导出。
- 文件变更、白名单命令和部署的工具审批；写入与执行只能在审批通过后发生。
- 静态预览发布，以及针对包含 `Dockerfile` 的工作区执行全栈 Docker 部署任务。
- 响应式 Web/PWA 客户端，以及 Electron 目录副本导入、导出桥接和系统通知。

## 安全模型

生成代码不会在 API 进程内执行。已批准的 Docker 命令和全栈部署任务由 `worker` 服务消费；在 Compose 中，只有 `worker` 会挂载 Docker socket。审批后的容器以非特权方式运行，并配置 CPU、内存和 PID 限制；公开部署前仍应补充生产级网络策略。

外部 CLI Agent 不会直接编辑正式受管工作区。worker 会把工作区复制到临时目录，在其中运行配置好的 CLI Docker 镜像，随后计算文件变化并创建 `apply_diff` 审批。只有审批通过的 diff 才会写回受管工作区。CLI 凭据与模型 BYOK 分开配置，并且不会在 API 响应中返回。

Web 产物预览运行在无同源权限的 iframe 中，并使用严格 CSP。受管 ZIP 导入会拒绝路径穿越，并限制文件数量和大小。

## 本地开发

后端：

```bash
cd backend
copy .env.example .env
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

前端：

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

桌面端：

```bash
cd electron
npm install
npm start
```

## API 概览

- `/api/settings/providers` 和 `/api/settings/providers/:provider/test`
- `/api/settings/cli-runtimes` 和 `/api/settings/cli-runtimes/:runtimeType/test`
- `/api/agent-runs`、`/:runId`、`/:runId/events`、`/:runId/cancel`
- `/api/workspaces`、`/:id/tree`、`/:id/file`、`/:id/import`、`/:id/export`
- `/api/artifacts`、`/:id/versions`、`/:id/download`、`/:id/export/pptx`
- `/api/approvals/:id/resolve`
- `/api/deployments`、`/:id/logs`、`/:id/stop`、`/:id/redeploy`

Socket 事件包括 `message:send`、`message:regenerate`、`orchestration:cancel`、`message:chunk`、`task:state`、`tool:approval-created` 和 `deployment:state`。

更多协议与安全边界请查看 [docs/implementation-architecture.md](docs/implementation-architecture.md)，验收演示路线请查看 [docs/demo-script.md](docs/demo-script.md)。

## 验证

运行：

```bash
cd backend
npx prisma validate
npx prisma generate
npm run build

cd ../frontend
npm run build
```
