# AgentHub 验收证据清单

本文档把《AgentHub- 多Agent协作平台设计.md》中的核心需求映射到当前项目中的实现文件、演示路径和可执行验证命令。用于答辩前自检，也用于说明哪些能力已经有自动化或半自动化证据。

## 1. 交付物

| 交付物 | 当前证据 | 验证方式 |
|---|---|---|
| 产品设计文档 | `AgentHub- 多Agent协作平台设计.md` | 人工审阅 |
| 技术文档 | `AgentHub-技术架构设计.md`、`docs/implementation-architecture.md` | 人工审阅 |
| 可运行 Demo | README 快速启动、seed demo workspace、`smoke:demo`、`smoke:delivery`、`smoke:runtime`、`smoke:realtime` | `npm run prisma:seed && npm run smoke:demo`；API 启动后跑 delivery smoke；API/Worker 启动后跑 runtime/realtime smoke |
| AI 协作开发记录 | `docs/ai-collaboration-record.md` | 人工审阅 |
| 3 分钟 Demo 视频 | `docs/demo-video/AgentHub-3min-demo.mp4`、`docs/demo-video/AgentHub-3min-demo-manifest.txt`、`docs/demo-video-script.md` | `ffprobe docs/demo-video/AgentHub-3min-demo.mp4`，确认约 180 秒 |

## 2. 核心功能验收

| 需求 | 当前实现 | 主要证据 |
|---|---|---|
| 新建对话 | 单聊/群聊创建，选择 Agent | `frontend/src/components/NewSessionModal.tsx`、`backend/src/controllers/ConversationController.ts` |
| 多会话并行 | 左侧会话列表、打开会话 tab、置顶/归档/搜索 | `frontend/src/components/SessionList.tsx`、`frontend/src/pages/ChatPage.tsx` |
| 群聊协作 | Orchestrator 创建任务图、执行多个 Agent、任务状态抽屉；seed 中保留已完成群聊编排样例 | `backend/src/services/Orchestrator.ts`、`backend/prisma/seed.ts`、`frontend/src/pages/ChatPage.tsx`、`npm run smoke:demo` |
| 上下文连续 | 历史消息、pin 长期上下文、Artifact 摘要进入上下文 | `backend/src/services/ContextService.ts`、`backend/src/controllers/MessageController.ts` |
| 产物内联 | Web、Diff、图片、附件、Slides、部署状态卡片；seed 中保留网页/文档/Slides 内联样例 | `backend/src/services/ArtifactExtractionService.ts`、`backend/prisma/seed.ts`、`frontend/src/components/MessageFlow.tsx`、`npm run smoke:demo` |
| 消息操作 | 引用、重新生成、复制代码、应用 Diff、展开预览 | `frontend/src/components/MessageFlow.tsx`、`backend/src/sockets/index.ts` |
| 统一 Agent 接入 | OpenAI、Anthropic、MiMo、Claude Code CLI、Codex CLI、OpenCode CLI | `backend/src/services/agents/AgentManager.ts`、`backend/src/services/CliRuntimeService.ts` |
| 用户自建 Agent | UI 创建 Agent；聊天 `/agent ...` 创建临时/自定义 Agent | `frontend/src/components/AgentContactList.tsx`、`backend/src/sockets/index.ts`、`npm run smoke:realtime` |
| 审批隔离 | 文件写入、命令、部署均生成审批 | `backend/src/controllers/ApprovalController.ts`、`frontend/src/components/ControlCenterModal.tsx` |
| 产物编辑与版本 | Artifact 编辑器、版本创建、版本内容读取；workspace 文件修订记录 | `frontend/src/components/ArtifactEditorModal.tsx`、`backend/src/controllers/ArtifactController.ts`、`backend/src/services/WorkspaceFileService.ts` |
| 部署发布 | 静态 Web Artifact 发布、本机 workspace 部署；部署均需审批并返回预览 URL | `backend/src/controllers/DeploymentController.ts`、`backend/src/services/LocalProcessExecutor.ts`、`backend/src/worker.ts`、`npm run smoke:delivery`、`npm run smoke:runtime` |
| 源码打包下载 | workspace ZIP 导入/导出、Artifact 下载、Slides PPTX 导出 | `backend/src/services/WorkspaceFileService.ts`、`backend/src/controllers/ArtifactController.ts`、`frontend/src/components/ControlCenterModal.tsx`、`npm run smoke:delivery` |
| Web 端支持 | 主力聊天、控制中心、工作台、Artifact/审批/部署管理 | `frontend/src/pages/ChatPage.tsx`、`frontend/src/components/ControlCenterModal.tsx` |
| 移动端支持 | 底部导航、会话/审批/产物/部署入口、移动文件预览抽屉 | `frontend/src/pages/ChatPage.tsx`、`frontend/src/index.css` |
| 桌面端支持 | Electron 壳、目录导入、Artifact 导出、部署通知桥接 | `electron/main.js`、`electron/preload.js` |

## 3. 自动化/半自动化验证命令

### 3.1 基础构建与数据

```bash
cd backend
npx prisma validate
npx prisma generate
npm run build
npm run prisma:seed
npm run smoke:demo
npm run preflight:local

cd ../frontend
npm run build
```

`smoke:demo` 是离线检查，不依赖外部模型 API。它验证 demo 账号、内置 Agent、群聊、workspace 文件、workspace revision、artifact 版本、聊天流内联产物卡片、已完成 Orchestrator 任务样例和本机部署前置条件。

API 启动后运行：

```bash
cd backend
npm run smoke:delivery
```

`smoke:delivery` 验证 HTTP 级交付链路：Artifact 下载、Slides PPTX 导出、Artifact 新版本创建与读取、workspace ZIP 导出、静态 Web Artifact 部署审批、token preview URL 可访问。

### 3.2 API + Worker 运行时验证

先启动 API 和 Worker：

```bash
cd backend
npm run dev
```

另开终端：

```bash
cd backend
npm run worker
```

第三个终端运行：

```bash
cd backend
npm run smoke:runtime
npm run smoke:realtime
```

`smoke:runtime` 验证 REST 级链路：登录、读取 workspace、创建 deployment、批准审批、Worker 启动本机预览、生成 preview URL、读取日志、停止部署。

`smoke:realtime` 验证 IM/Socket 链路：Socket 登录、聊天创建自定义 Agent、聊天发送 `/deploy`、收到审批事件、批准后收到 `deployment:state success`、停止部署。

## 4. 当前已知边界

- 本机 Runner 是可信本地 Demo，不是生产级操作系统沙箱。
- 外部 CLI Agent 的真实生成效果依赖本机 CLI 安装、登录状态和模型/API 可用性。
- `smoke:runtime` 和 `smoke:realtime` 需要 API 与 Worker 运行，并且在受限沙箱外具备 localhost 端口绑定权限。
- 当前自动化证据覆盖 API、Worker、Socket 和构建；已有生成版 3 分钟视频，完整浏览器视觉效果仍建议按 `docs/demo-video-script.md` 人工录屏增强。
