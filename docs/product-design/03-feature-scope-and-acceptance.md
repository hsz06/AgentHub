# 03. 功能范围与验收口径

## 1. P0：可运行 Demo

P0 的目标是证明 AgentHub 的主链路真实可跑。

|模块|能力|验收口径|
|---|---|---|
|登录|Demo 用户可以登录|使用 README 中账号进入系统|
|会话|创建、切换、删除、归档、置顶|刷新后会话仍存在|
|消息|发送、流式回复、失败回写|Agent 失败时显示明确错误|
|Agent|内置 Agent、自建 Agent、CLI Agent|自建 Agent 可配置 Provider / Prompt|
|@ 提及|聊天框输入 `@` 显示 Agent 列表|发送后后端收到 `mentionedAgentIds`|
|Workspace|创建、导入、绑定会话、文件树|绑定后工作台能读取文件|
|CLI Runtime|配置 Claude Code executable path|Runtime Test 能运行 `--version`|
|审批|Diff / 命令 / 部署审批|批准前不写正式 workspace|
|Artifact|Web / Document / Code 基础预览|聊天流或控制中心可打开|

## 2. P1：完整产品体验

P1 的目标是让 Demo 具备完整工程控制台体验。

|模块|能力|验收口径|
|---|---|---|
|Orchestrator|群聊任务拆分、子任务调度|同一会话中可看到分派和汇总|
|Agent 配置|内置只读、自建可编辑删除|保存后新建会话和 @ 提示立即生效|
|工作台|Monaco 多文件打开、脏标识、提交审批|手工修改不直接写盘|
|Artifact Workspace|预览 / 编辑分离、版本历史、下载|移动端默认只读预览|
|部署|静态 Artifact 发布、本机 Node 启动|有访问 URL、日志、停止、重新部署|
|运行日志|CLI Run / Deployment Run 可查|失败能定位到命令、stderr 或退出码|

## 3. P2：增强能力

P2 用于展示产品扩展潜力，不作为最小 Demo 的硬性条件。

|模块|能力|说明|
|---|---|---|
|桌面端|本地目录导入、通知、Artifact 导出|Electron 复用 Web UI|
|移动端|审批确认、Artifact 预览、部署状态查看|不做完整代码编辑|
|Slides|幻灯片预览和 PPTX 导出|偏展示价值|
|冲突处理|baseHash 冲突时生成合并审批|保证多人 / 多 Agent 修改可控|
|更强 Runner|远程 Runner、容器、Firecracker|生产化方向，不是本地 Demo 必需|

## 4. 评分维度映射

|维度|产品侧证据|验收方式|
|---|---|---|
|AI 协作能力 30%|Spec、rules、skill、Prompt 模板、开发记录|查看 `docs/ai-collaboration/`|
|功能完整度 25%|IM、多 Agent、Orchestrator、Workspace、审批、Artifact|按 P0 / P1 清单逐项演示|
|生成效果质量 20%|聊天 UI、Artifact 预览、工作台、移动端适配|桌面和窄屏分别验证|
|代码理解度 15%|架构链路和核心代码入口清晰|查看 `docs/technical-design/`|
|创新与产品感 10%|Agent 联系人化、群聊协作、Diff 审批、产物内联|通过 Demo 展示完整体验|

## 5. 验收用例

### 用例 1：自建 Agent 单聊

```text
前置：Provider 已配置 API Key 和默认模型。
操作：创建自建 testAgent，发送 “你好，请介绍你的职责”。
期望：Agent 返回正常文本；失败时消息显示明确错误。
```

### 用例 2：Claude Code 修改 workspace

```text
前置：Claude Code CLI 已登录，当前会话绑定 workspace。
操作：发送 “请给 README 增加一段本机启动说明”。
期望：CLI 在临时目录运行，生成 Diff 审批；批准前正式 README 不变，批准后更新。
```

### 用例 3：群聊协作

```text
前置：会话包含 Orchestrator、前端 Agent、测试 Agent、文档 Agent。
操作：发送 “做一个任务管理页面，并补测试和说明”。
期望：Orchestrator 拆分任务，多个 Agent 依次回复，最终有汇总。
```

### 用例 4：Artifact 预览

```text
前置：已有 Web 或 Markdown Artifact。
操作：在聊天流或控制中心点击 Preview。
期望：桌面端打开预览 Drawer；移动端打开只读预览；下载入口可用。
```

### 用例 5：本机部署

```text
前置：workspace 存在 package.json 和 scripts.start。
操作：发起部署审批并批准。
期望：Worker 分配端口，启动 npm run start，生成代理 URL，可停止和重新部署。
```

## 6. 明确不通过的情况

- Agent 修改正式 workspace 但没有审批记录。
- CLI Agent 无 workspace 时静默失败。
- 消息一直 streaming，失败原因不可见。
- 移动端打开编辑器后按钮超出视口。
- Artifact 只能下载，不能预览。
- 文档宣称生产级沙箱，但实现只是本机临时目录。
