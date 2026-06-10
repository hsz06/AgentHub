# 03. 评分维度与证据

## 1. AI 协作能力 30%

证据：

- 产品 Spec：`docs/product-design/`
- 技术 Spec：`docs/technical-design/`
- AI rules：`docs/ai-collaboration/01-rules-and-prompts.md`
- 可执行协作规范：`docs/ai-collaboration/04-spec-skill-rules-playbook.md`
- 开发日志：`docs/ai-collaboration/02-development-log.md`
- Prompt 模板：Coding、Review、Orchestrator、Documentation、验收 Prompt

说明：

项目不是一次性让 AI 生成代码，而是围绕需求拆解、规则约束、逐步诊断和验收闭环进行。`04-spec-skill-rules-playbook.md` 进一步定义了每类协作资产的模板、触发条件、输入输出和完成标准，可直接作为后续 AI 任务上下文。

## 2. 功能完整度 25%

证据链路：

```text
登录
  → 创建会话
  → 选择 / 配置 Agent
  → 发送消息 / @Agent
  → Agent 回复
  → 绑定 workspace
  → CLI 修改临时副本
  → 生成审批
  → 批准写回
  → 产物预览
  → 本机部署
```

对应模块：

- `frontend/src/pages/ChatPage.tsx`
- `frontend/src/components/MessageInput.tsx`
- `frontend/src/components/ControlCenterModal.tsx`
- `frontend/src/components/WorkspaceWorkbench.tsx`
- `backend/src/sockets/index.ts`
- `backend/src/services/Orchestrator.ts`
- `backend/src/services/agents/CliAgent.ts`

## 3. 生成效果质量 20%

证据：

- 桌面端 IM 主区可读，不被工作台挤压。
- 工作台点击后打开，支持文件树和 Monaco。
- Artifact 支持 Web iframe、Markdown、Slides、Code / Attachment 预览。
- 移动端保留会话、审批、产物和更多入口。
- Control Center 子页面内容可滚动，不横向撑爆。

验收建议：

```text
1. 1366x768 桌面验证聊天不竖排。
2. 点击工作台，打开 workspace 文件。
3. 打开 Artifact Preview。
4. 窄屏验证底部导航和审批预览。
```

## 4. 代码理解度 15%

答辩建议讲解顺序：

1. 为什么选择 IM 作为主交互。
2. Conversation / Message / Agent / Workspace / Approval / Artifact 的关系。
3. Socket 如何触发 Agent。
4. ContextService 如何构建上下文。
5. Orchestrator 如何拆分任务。
6. CliAgent 如何在临时 workspace 中运行。
7. Diff Approval 如何保护正式 workspace。
8. Artifact 和 Deployment 如何回到聊天流。

## 5. 创新与产品感 10%

证据：

- Agent 联系人化：把 Claude Code、Codex、自建 Agent 变成聊天对象。
- 群聊协作：多个 Agent 在同一会话中分工。
- 本机 Runner：复用用户已安装 CLI 和 OAuth。
- 审批隔离：AI 可以改代码，但用户保留最终写入权。
- Artifact 内联：产物不是附件堆积，而是可预览、可版本化对象。
- 移动端轻量化：不复制桌面 IDE，只做查看和审批。

## 6. 验证命令

前端：

```bash
cd frontend
PATH=/home/hsz/software/node/bin:$PATH npm run build
```

后端：

```bash
cd backend
PATH=/home/hsz/software/node/bin:$PATH npm run build
```

文档空白检查：

```bash
git diff --check
```

本机预检：

```bash
cd backend
PATH=/home/hsz/software/node/bin:$PATH npm run preflight:local
```

## 7. 剩余风险说明

|风险|答辩说法|
|---|---|
|本机 Runner 不是生产沙箱|当前是可信本地 Demo，生产化需远程 Runner 或 Firecracker|
|CLI 依赖本机登录状态|这是本机 Demo 设计，降低接入成本|
|群聊调度仍偏规则化|P0 / P1 先保证可解释和稳定，后续可引入模型规划|
|端到端需要 API Key|Provider 配置中心支持 BYOK，Demo 环境需提前配置|
|移动端不支持完整编辑|移动端定位是轻量 IM、审批和预览|
