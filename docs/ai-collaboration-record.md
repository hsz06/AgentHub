# AI 协作开发记录

本文档记录 AgentHub 开发过程中的 AI 协作方式、约束规则、任务拆分和验收证据，用于对应课题考察要点中的 “Spec / rules / skill 沉淀”。

详细协作分册见 `docs/ai-collaboration/`：

- `01-rules-and-prompts.md`：协作规则、Prompt 模板、Agent 角色模板。
- `02-development-log.md`：关键开发迭代、问题诊断和修复记录。
- `03-evaluation-evidence.md`：评分维度证据、验收命令、答辩材料索引。
- `04-spec-skill-rules-playbook.md`：可执行的 Spec / Skill / Rules 协作规范。

## 1. 协作目标

AgentHub 的开发目标不是只生成一个聊天 UI，而是交付一个可运行的本机多 Agent 协作 Demo：

1. IM 会话作为主交互入口，支持单聊、群聊、@ Agent、消息流、pin、引用和重新生成。
2. 后端通过统一 Adapter 接入 OpenAI、Anthropic、MiMo 以及 Claude Code / Codex / OpenCode CLI Runtime。
3. CLI Agent 只能在临时 workspace 副本中运行，文件变化必须转换为审批项。
4. Artifact、审批、部署和任务状态必须回到聊天流或控制中心中展示。
5. 本机 Runner 只面向可信 Demo，不声明为生产级 OS 沙箱。

## 2. AI 协作规则

### 2.1 需求澄清规则

- 先从《AgentHub- 多Agent协作平台设计.md》和《AgentHub-技术架构设计.md》抽取验收点，再写代码。
- 对 P0 / P1 / P2 明确分层：优先补齐可运行 Demo 链路，避免提前做云端多租户或生产级沙箱。
- 遇到不确定实现时，先记录边界和风险，不把假设写成已完成能力。

### 2.2 代码修改规则

- 每次只围绕一个可验证目标修改代码，例如 “让 CLI Runtime 产生 Diff Approval” 或 “让本机 Node 预览走审批后启动”。
- 不做无关重构，不删除已有用户改动。
- 后端共享行为优先放在 service 层；controller 只做鉴权、参数解析和响应组装。
- 前端优先复用已有 Ant Design、组件和 store 结构，不引入新的状态管理方案。

### 2.3 Runtime 安全规则

- CLI executable path、启用状态、权限档位和可选 API Key 由 Control Center 配置。
- Agent 修改正式 workspace 前必须创建 `ToolApproval`，审批通过后才应用。
- Worker 执行白名单命令时使用固定参数，不拼接 shell。
- 本机项目部署只允许 `npm run start`，并要求 workspace 存在 `package.json` 和 `scripts.start`。
- 预览 URL 使用 token 保护，iframe 使用严格 CSP。

### 2.4 验收规则

每个开发切片至少保留一种可复查证据：

- 数据结构变更：`npx prisma validate` 或 migration 文件。
- 后端行为变更：`npm run build`。
- 前端行为变更：`npm run build`。
- Demo 链路变更：更新 `docs/demo-script.md` 或 README 验证步骤。

## 3. 关键协作切片

| 切片 | 目标 | 产出 |
|---|---|---|
| IM 基础体验 | 让用户以会话和消息为中心操作 Agent | 会话列表、聊天流、Agent 联系人、消息操作 |
| Provider 配置 | 支持 BYOK 和本地默认模型 | Control Center Provider 配置、密钥加密保存 |
| CLI Runtime | 接入 Claude Code / Codex / OpenCode 本机可执行文件 | Runtime 配置、测试、`CliRun` 持久化 |
| Workspace 管理 | 管理受控项目目录 | workspace 创建、导入、导出、文件树和文件读取 |
| 审批隔离 | Agent 写入和命令执行必须先审批 | `ToolApproval`、Diff 预览、批准后写回 |
| Orchestrator | 支持群聊任务拆分和状态展示 | `OrchestrationRun`、`OrchestrationTask`、任务重试 |
| Artifact | 把产物放回聊天流和控制中心 | Web / Code / Document / Slides / Attachment 版本 |
| 本机部署 | 支持静态 Artifact 和 Node workspace 预览 | 部署审批、日志、停止、重部署、token proxy |
| 桌面端 | 支持本地目录导入和导出 | Electron preload API 和桌面壳 |

## 4. Prompt 模板沉淀

### 4.1 Coding Agent 任务模板

```text
你在 AgentHub 的受控 workspace 副本中工作。
目标：{task}
约束：
1. 先阅读相关文件再修改。
2. 只修改完成任务所必需的文件。
3. 不要声称已经写入正式 workspace；平台会把文件差异转换为审批。
4. 如需执行命令，只提出平台允许的命令，由用户审批。
输出：
- 说明修改了什么。
- 列出需要审批的文件或命令。
- 标注无法验证的部分。
```

### 4.2 Review Agent 任务模板

```text
你是 AgentHub 群聊中的代码评审 Agent。
请检查上一个 Agent 的产出：
1. 是否满足用户需求。
2. 是否引入明显 bug、安全风险或不可运行代码。
3. 是否存在 UI 溢出、状态不同步或审批绕过。
只报告实质问题；没有问题时说明剩余风险和建议验证命令。
```

### 4.3 Orchestrator 任务模板

```text
你是 AgentHub Orchestrator。
根据用户消息和 @Agent 列表拆分任务：
1. 每个子任务有清晰输入、负责 Agent 和验收标准。
2. 对写文件、命令执行、部署启动保留审批关卡。
3. 子任务失败时给出降级方案或重试建议。
最终输出聚合摘要，并引用聊天流中的 Artifact / Approval / Deployment 卡片。
```

## 5. 当前可验证状态

截至 2026-06-09，当前工作树的基础验证结果：

- 后端：使用 `PATH=/home/hsz/.vscode-server/bin/c9d77990917f3102ada88be140d28b038d1dd7c7:/home/hsz/software/node/bin:$PATH npm run build`，TypeScript 编译通过。
- 前端：使用 `PATH=/home/hsz/.vscode-server/bin/c9d77990917f3102ada88be140d28b038d1dd7c7:/home/hsz/software/node/bin:$PATH npm run build`，`tsc` 和 Vite 生产构建通过。
- 本机预检：同一 Node 22 PATH 下 `npm run preflight:local` 通过，Claude Code 已登录。
- README 已提供本机 Demo 启动、Worker 启动、Web 启动和验证命令。
- `docs/demo-script.md` 已提供 3 分钟本机 Demo 路线。

## 6. 剩余风险

- 本机 Runner 是可信 Demo 边界，不是生产级沙箱；答辩时必须明确说明。
- Claude Code / Codex / OpenCode 的实际运行依赖本机 CLI 安装、登录状态和 executable path 配置。
- 端到端 Demo 需要真实 API Key 或本机 CLI 登录状态，构建通过不能替代现场运行验证。
- 生产化部署还需要更强的资源隔离、日志流、审计和远程 Runner。

## 7. Spec / Rules / Skill 资产清单

本项目把 AI 协作资产分成三类：需求 Spec、工程 Rules、任务 Skill。它们的目标是让后续 AI Agent 不需要重新猜项目边界。

### 7.1 Spec

|资产|用途|位置|
|---|---|---|
|产品设计 Spec|定义产品目标、用户旅程、核心功能、优先级和考察要点|`AgentHub- 多Agent协作平台设计.md`|
|技术架构 Spec|定义服务拆分、数据模型、Runtime、审批、部署和答辩链路|`AgentHub-技术架构设计.md`|
|验收清单|把功能完成度拆成可检查条目|`docs/acceptance-checklist.md`|
|实现审计|记录当前实现与需求的差距和风险|`docs/completion-audit.md`|
|Demo 脚本|把现场演示拆成可重复步骤|`docs/demo-script.md`|

### 7.2 Rules

|规则|原因|
|---|---|
|所有文件写入必须经过审批|避免 Agent 直接覆盖正式 workspace|
|CLI Agent 只在临时 workspace 副本中运行|本机 Demo 降低破坏范围|
|命令执行只走白名单和固定参数|避免 shell 拼接和任意命令执行|
|Provider / CLI Runtime 由 Control Center 配置|让模型与本机 CLI 状态可见、可测试|
|前端改动必须通过 `npm run build`|保证 TypeScript 和 Vite 构建不过时|
|后端改动必须通过 `npm run build`|保证 TypeScript、Prisma Client 类型和服务接口一致|
|文档不能声称未完成能力已经完成|答辩时需要区分 Demo 能力和生产化边界|

### 7.3 Skill

|Skill|适用任务|沉淀结果|
|---|---|---|
|需求拆解 Skill|把大需求拆成 P0 / P1 / P2|产品文档的优先级与验收口径|
|前端设计 Skill|优化聊天、工作台、Artifact 和移动端体验|统一工程控制台风格和布局规则|
|诊断 Skill|处理 CLI 无返回、消息竖排、Provider 400 等问题|形成复现、定位、修复、验证记录|
|代码评审 Skill|检查改动是否破坏审批、安全边界或构建|每次修改后的 build / diff check|
|答辩说明 Skill|把实现映射回评分维度|技术文档的考察要点实现映射|

## 8. AI 协作迭代记录

### 8.1 本机 Runner 改造

问题：初始方案依赖 Docker，但本机 Demo 环境不一定适合运行 Docker，且用户已经安装 Claude Code CLI。

AI 协作过程：

1. 从需求中抽取边界：不复制 Claude 二进制、不要求额外 API Key、复用本机 OAuth。
2. 把 Docker Runtime 改成本机 executable path。
3. 保留 legacy 字段，避免旧数据迁移风险。
4. 引入 `LOCAL_EXECUTION_ENABLED` 显式开关。
5. 用临时 workspace + Diff 审批保留安全边界。

结果：Demo 可以直接用 `/home/hsz/software/node/bin/claude` 运行，Docker 内容降级到 legacy 目录和兼容字段。

### 8.2 Claude Code CLI 输出解析

问题：Claude Code 2.1.117 的 `stream-json` 输出和预期格式不完全一致，前端出现 “CLI completed with no file changes.”，实际模型回复没有被正确抽取。

AI 协作过程：

1. 先用真实 CLI 输出复现，确认不是模型不可用。
2. 分析 JSON Lines 中 `assistant.message.content[].text` 与旧 `stream_event` 差异。
3. 修改 Adapter 解析逻辑，避免把有用文本丢弃。
4. 修正 `eventsToText` 合并逻辑，避免流式 token 被逐字换行。
5. 重新构建后端验证类型通过。

结果：CLI Agent 能显示真实文本；没有文件变更时才显示无 Diff 的状态。

### 8.3 Provider / 自建 Agent 配置

问题：自建 Agent 返回 `messages` 为空数组，说明上下文构建和模型配置存在边界问题。

AI 协作过程：

1. 检查 Provider 配置中心，区分 “外接 CLI 模型” 和 “自建 Agent 模型”。
2. 修复 Provider 默认模型、Base URL、API Key 的读取和保存逻辑。
3. 调整 ContextService 的 token 预留策略，避免小预算模型把输入消息全部截断。
4. 前端 Agent 配置中显示 Provider 默认模型，并允许自建 Agent 不重复填写模型。
5. Agent 调用失败时把错误写回消息，而不是让消息永远停留在 streaming。

结果：自建 Agent 能复用模型服务配置，失败时也能在聊天流中看到明确错误。

### 8.4 前端布局与可用性

问题：聊天主区被工作台挤压，消息出现单字竖排；部分 Control Center 子页面按钮超出视口或不可点击。

AI 协作过程：

1. 先判断是布局约束问题，不是单纯视觉问题。
2. 将桌面工作台改为默认按需打开，避免压缩 IM 主区。
3. 给消息流、消息体、输入框和抽屉内容补充 `min-width: 0`、局部滚动和宽度约束。
4. Workspace 列表改成自适应卡片布局，按钮允许换行。
5. 保留现有视觉风格，不重新引入 UI 框架。

结果：聊天主区恢复可读宽度，工作台通过按钮打开，控制中心在窄屏下不再横向撑爆。

### 8.5 Artifact 与移动端补齐

问题：产物入口偏向下载和编辑，移动端打开大 Modal 体验弱，不满足 “轻量 IM：产物预览” 的定位。

AI 协作过程：

1. 将 Artifact 查看和编辑拆成 preview / edit 两种模式。
2. 桌面端保留 Drawer 编辑、版本保存、下载和 PPTX 导出。
3. 移动端默认只读预览，复杂编辑能力降级。
4. Web、Document、Slides、Code / Attachment 分别定义预览策略。

结果：Artifact 既能作为聊天产物展示，也能进入控制中心管理；移动端不再强行承载完整编辑器。

## 9. 人机协作分工

|参与方|职责|
|---|---|
|用户|给出业务目标、Demo 环境约束、真实运行反馈和优先级判断|
|AI 编码助手|阅读现有代码、拆解计划、实现改动、运行构建和补充文档|
|模型 / CLI Agent|作为 AgentHub 被测对象，验证本机 Runtime、OAuth、输出解析和文件修改流程|
|人工审批者|判断 Diff、命令执行、部署启动是否允许进入正式 workspace|

协作原则：

1. 用户反馈真实运行问题，例如 “没有返回”、“消息竖排”、“按钮点不动”。
2. AI 先定位问题属于后端解析、前端布局、Provider 配置还是产品边界。
3. 修改后必须给出可复查命令或可观察 UI 行为。
4. 文档同步更新，避免答辩材料和代码实现脱节。

## 10. 评分维度对应证据

|评分维度|证据|
|---|---|
|AI 协作能力|本文档的规则、Prompt 模板、迭代记录、验收规则|
|功能完整度|IM、Agent、Orchestrator、Workspace、Approval、Artifact、Deployment 的端到端链路|
|生成效果质量|前端布局修复、Artifact 预览、移动端轻量入口、Monaco 工作台|
|代码理解度|技术文档中的实现映射和核心链路说明|
|创新与产品感|Agent 联系人化、群聊协作、临时 workspace + Diff 审批、聊天流内联产物|

## 11. 后续协作规则

后续继续使用 AI 开发时，优先遵循以下顺序：

1. 先把需求写成一个可验收切片。
2. 查找现有 service / component，不新增平行抽象。
3. 对文件写入、命令执行、部署启动保持审批边界。
4. 修改前端后运行前端 build；修改后端后运行后端 build。
5. 每次修复真实运行问题后，把原因、修复点和验证方式补入本文档或验收清单。
