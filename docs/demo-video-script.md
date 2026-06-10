# AgentHub 3 分钟 Demo 视频脚本

本文档用于录制课题交付物中的 “3 分钟 Demo 视频”。目标是在 180 秒内证明 AgentHub 的核心价值：**IM 聊天、多 Agent 协作、本机 CLI Runtime、Workspace 审批隔离、Artifact 预览和交付文档完整性**。

## 1. 录制定位

### 视频标题

```text
AgentHub：基于 IM 的多 Agent 协作开发平台 Demo
```

### 一句话开场

```text
AgentHub 是一个以 IM 聊天为入口的多 Agent 协作平台，用户可以像拉群聊天一样组织 Claude Code、自建 Agent 和 Orchestrator，在受控 workspace 中完成代码修改、审批和产物预览。
```

### 视频重点

3 分钟内只展示主链路，不讲所有细节：

1. IM 是主入口。
2. Agent 可以作为联系人被选择和 @。
3. Claude Code CLI 通过本机 Runtime 接入。
4. CLI 修改只发生在临时 workspace，正式写入必须审批。
5. 群聊 Orchestrator 能做任务拆分。
6. Artifact 能预览，交付文档完整。

## 2. 录制前准备

### 服务状态

建议录制前打开三个终端，并确认没有报错：

```bash
cd backend
PATH=/home/hsz/software/node/bin:$PATH npm run dev
```

```bash
cd backend
PATH=/home/hsz/software/node/bin:$PATH npm run worker
```

```bash
cd frontend
PATH=/home/hsz/software/node/bin:$PATH npm run dev
```

### 浏览器准备

1. 打开 `http://localhost:5173`。
2. 登录演示账号：

```text
demo@agenthub.local
AgentHub123!
```

3. 准备一个已绑定 workspace 的 Claude Code CLI 单聊。
4. 准备一个群聊，包含 Orchestrator 和 2-3 个自建 Agent。
5. Control Center 中确认：
   - Provider 已配置。
   - Claude Code Runtime 已启用。
   - Workspace 已导入或创建。
   - 至少有一个 Artifact 示例。

### 录制设置

- 分辨率建议：1366x768 或 1440x900。
- 浏览器缩放：100%。
- 只录浏览器窗口和必要终端，不录无关桌面。
- 鼠标移动慢一点，按钮点击后停 1 秒。
- 如果真实模型响应慢，可使用已有历史消息和 seed 示例展示，不要在视频里长时间等待。

## 3. 3 分钟分镜脚本

|时间|画面|操作|旁白|
|---|---|---|---|
|0:00-0:12|AgentHub 聊天主页|停在会话列表和聊天区|“这是 AgentHub，一个以 IM 为核心交互的多 Agent 协作平台。左侧是会话，中央是聊天流，右上角可以进入审批、工作台和控制中心。”|
|0:12-0:25|新建 / 已有会话列表|切换 Claude Code CLI 单聊|“每个 Agent 都被设计成一个聊天对象。用户可以单独和 Claude Code CLI 对话，也可以创建群聊让多个 Agent 协作。”|
|0:25-0:42|控制中心 > CLI Runtime|打开 Control Center，切到 CLI Runtime，展示 Claude Code executable path 和 Test 状态|“Claude Code、Codex、OpenCode 通过统一 Runtime Adapter 接入。这里不是把二进制放进项目，而是使用本机已安装的 CLI 和 OAuth 登录状态。”|
|0:42-0:55|控制中心 > Workspace|切到 Workspace，展示绑定当前会话的 workspace|“Agent 的代码任务必须绑定一个受管 workspace。这样平台知道 Agent 可以读取和修改哪个项目。”|
|0:55-1:12|Claude Code 单聊|发送或展示已发送任务：`请阅读 README，补充本机启动说明，只提交必要修改。`|“现在我让 Claude Code 修改 README。关键点是：Agent 不会直接写正式目录，而是在临时 workspace 副本中执行。”|
|1:12-1:32|聊天流 / Agent Run|展示 Agent 回复、运行状态或历史完成消息|“CLI 运行过程会被记录为 Agent Run，stdout、stderr、退出码和状态都会保存。模型回复会回到聊天流里，而不是只停留在终端。”|
|1:32-1:55|审批 / Diff 卡片|打开审批，展示 Diff，点击或展示批准状态|“文件变化会被转换成 Diff 审批。只有用户批准之后，变更才会写回正式 workspace。这个设计保证了 AI 可以生成代码，但最终控制权仍在用户手里。”|
|1:55-2:12|群聊会话|切到群聊，展示多个 Agent 和 @ 提及|“除了单聊，AgentHub 也支持群聊模式。用户可以 @ 多个 Agent，或者让 Orchestrator 根据任务自动拆分工作。”|
|2:12-2:30|Orchestrator / 任务状态|展示任务拆分、多个 Agent 回复或 Task status|“Orchestrator 会把复杂需求拆成子任务，例如前端实现、后端接口、测试验收和文档总结。每个子任务都有状态，失败时也能单独暴露。”|
|2:30-2:45|Artifact 预览|打开 Artifact Preview，展示 Web / Markdown / Code 任一种|“Agent 的产物不是散落的文本，而是以内联 Artifact 回到平台中。网页可以 iframe 预览，文档可以 Markdown 渲染，代码和附件可以查看或下载。”|
|2:45-2:56|文档目录|切到 README 或 docs 目录，展示 product-design、technical-design、ai-collaboration|“交付材料也按评分维度拆开：产品设计、技术设计、AI 协作记录，以及可运行 Demo 的验证脚本。”|
|2:56-3:00|回到聊天主页|停在 AgentHub 主界面|“这就是 AgentHub：用 IM 组织多 Agent 协作，用审批保护 workspace，用 Artifact 承载最终交付。”|

## 4. 可照读旁白完整版

下面是一版完整旁白，可按 3 分钟语速直接录制。

```text
这是 AgentHub，一个以 IM 为核心交互的多 Agent 协作平台。
左侧是会话列表，中间是聊天流，右上角可以进入审批、工作台和控制中心。

在 AgentHub 里，每个 Agent 都像一个聊天联系人。
用户可以创建 Claude Code CLI 单聊，也可以创建群聊，把 Orchestrator、前端 Agent、测试 Agent 和文档 Agent 放到同一个会话里协作。

先看 Runtime 配置。
Claude Code、Codex、OpenCode 通过统一的 Runtime Adapter 接入。
这里配置的是本机 executable path，例如 Claude Code 使用用户已经安装并登录的 CLI。
AgentHub 不把 Claude 二进制复制到项目里，也不强制额外 API Key。

再看 workspace。
CLI Agent 必须绑定受管 workspace 才能执行文件任务。
这是安全边界的一部分：Agent 可以读取项目，但写入正式 workspace 前必须经过审批。

现在进入 Claude Code 单聊。
我发送一个简单任务：请阅读 README，补充本机启动说明，只提交必要修改。
Claude Code 会在临时 workspace 副本中运行，运行状态、stdout、stderr 和退出码都会记录到 Agent Run。
模型输出会回到聊天流，而不是只停留在终端里。

当 Agent 修改文件后，平台不会立刻覆盖正式项目。
它会生成 Diff 审批，用户可以查看修改前后的内容。
只有点击批准之后，变更才会写回正式 workspace。
这个设计让 AI 能真实参与代码修改，同时保留人工最终控制权。

接着看群聊模式。
在同一个会话中，用户可以 @ 多个 Agent，也可以让 Orchestrator 自动拆分任务。
例如一个页面开发需求，可以拆成前端实现、后端接口、测试验收和文档总结。
每个子任务都有状态，失败时可以单独降级，不会让整个会话静默卡住。

最后看产物。
Agent 的回复不只是文本，也可以生成 Artifact。
网页可以用安全 iframe 预览，Markdown 文档可以渲染查看，代码和附件可以打开或下载。
这些产物都保留在聊天上下文和控制中心里，方便后续继续迭代。

项目交付材料也已经按评分维度整理：
产品设计文档说明目标用户和用户旅程，
技术文档说明架构、核心流程和安全边界，
AI 协作记录沉淀 Spec、Skill、Rules 和开发日志。

这就是 AgentHub：用 IM 组织多 Agent 协作，用审批保护 workspace，用 Artifact 承载最终交付。
```

## 5. 演示输入文本

### 单聊修改任务

```text
请阅读当前 workspace 的 README，补充一段“本机无 Docker 启动说明”。保持原有风格，只提交必要修改。
```

### 群聊任务

```text
@Orchestrator 请组织前端 Agent、测试 Agent 和文档 Agent，检查这个项目的 Demo 体验：先找出一个前端可用性问题，再给出验收标准和文档补充建议。
```

### Artifact 生成任务

```text
请基于当前项目生成一份 Markdown Demo 说明，包含启动步骤、核心能力和验收清单，并作为 Artifact 返回。
```

### 部署任务，可选

如果时间足够再展示部署：

```text
请启动当前 workspace 的本机预览，生成可访问 URL，并返回运行日志。
```

## 6. 录制检查清单

录制前确认：

- 登录账号可用。
- 至少一个 Claude Code CLI Runtime 启用并测试通过。
- 当前会话绑定 workspace。
- 至少有一条 Agent 回复或 Agent Run 记录。
- 至少有一个 Diff 审批或审批历史。
- 至少有一个 Artifact 可预览。
- `docs/product-design/`、`docs/technical-design/`、`docs/ai-collaboration/` 可展示。

录制后检查：

- 视频时长控制在 2:50 到 3:10。
- 没有展示 API Key、token、个人隐私路径以外的敏感信息。
- 没有长时间等待模型输出。
- 旁白明确说明本机 Runner 不是生产级沙箱。
- 至少展示一次 “审批前不直接写正式 workspace” 的设计。

## 7. 失败降级方案

|问题|降级展示方式|旁白处理|
|---|---|---|
|模型临时无响应|展示历史消息、Agent Run 日志和 Runtime Test|“现场模型调用依赖外部服务，这里展示已记录的运行结果。”|
|Claude Code CLI 未登录|展示 Runtime 配置和 `--version` 测试|“CLI 接入由本机登录状态决定，平台负责路径、权限和日志。”|
|Diff 没生成|展示已有审批历史或手工修改审批|“Agent 和手工编辑都走同一个审批模型。”|
|部署启动慢|跳过部署，展示 Artifact 预览|“部署是增强能力，本视频重点展示 IM、Runtime、审批和 Artifact 主链路。”|
|群聊任务较慢|展示 seed 群聊或已有 Orchestrator 任务状态|“群聊状态持久化后可以随时回看。”|

## 8. 推荐最终画面

最后停留在聊天主页，画面中同时能看到：

- 左侧会话列表。
- 中央 Agent 回复或 Artifact 卡片。
- 顶部 “审批 / 工作台 / 控制中心”。

收尾旁白：

```text
AgentHub 的重点不是简单调用多个模型，而是把多 Agent 协作、workspace 安全边界和产物交付组织到一个 IM 工作流里。
```
