# 02. AI 协作开发日志

## 1. 本机 Runner 改造

### 背景

项目最初以 Docker Runner 为主，但本机 Demo 环境中 Docker 会增加安装和调试成本。用户已安装 Claude Code CLI，并希望直接使用本机 OAuth 状态。

### 决策

- 主流程从 Docker image 改为 executable path。
- Claude Code 使用 `/home/hsz/software/node/bin/claude`。
- Codex / OpenCode 保留为可选本机 CLI。
- Docker 文件迁入 legacy，不作为主入口。
- 新增 `LOCAL_EXECUTION_ENABLED`，明确本机执行开关。

### 结果

本机 Demo 不需要 Docker 即可运行 API、Worker、前端和 CLI Runtime。

## 2. CLI 输出解析问题

### 现象

Claude Code CLI 可以运行，但 AgentHub 中经常只显示：

```text
CLI completed with no file changes.
```

### 诊断

真实输出中包含新的 JSON Lines 结构：

```text
assistant.message.content[].text
```

旧解析逻辑只处理部分 `stream_event`，导致文本被丢弃。

### 修复

- 更新 Claude Code Adapter 输出解析。
- 移除导致输出过碎的参数。
- 修复 `eventsToText` 合并逻辑。
- 有真实 stdout 文本时不再追加无文件变化占位文案。

### 验证

- 后端 build 通过。
- 前端消息不再只显示无文件变化。

## 3. 聊天消息竖排问题

### 现象

桌面 1366px 宽度下，右侧工作台挤压聊天区，中文消息按单字竖排。

### 诊断

这不是流式传输问题，而是布局约束失效：

- 工作台常驻占据过多宽度。
- 消息容器缺少 `min-width: 0` 和合理宽度。
- 文本换行策略过于激进。

### 修复

- 工作台改为默认点击打开。
- 聊天主区保留最小可读宽度。
- 消息体恢复正常段落换行。
- 输入框跟随聊天区，不被工作台影响。

## 4. 自建 Agent Provider 配置问题

### 现象

自建 testAgent 返回：

```text
messages must be an array with minimum length 1
```

### 诊断

问题来自两个方向：

- Provider 默认模型配置和自建 Agent 模型配置边界不清。
- ContextService 对某些模型预算预留过大，导致输入消息被截断为空。

### 修复

- Provider 配置中心明确服务于自建 Agent。
- CLI 模型配置不放进模型服务配置中处理。
- 自建 Agent 可复用 Provider 默认模型。
- ContextService 动态预留输出 token。
- Agent 调用失败时消息状态回写 failed。

## 5. Control Center 溢出和按钮不可点击

### 现象

Workspace 页签中按钮横向超出，部分按钮不可点击。

### 诊断

Ant Design `List.Item actions` 在窄宽度下不适合承载多个按钮、路径和状态标签。

### 修复

- Workspace 列表改为自定义卡片布局。
- 操作按钮允许换行。
- 内容区局部滚动。
- 路径和长名称做截断。

## 6. Agent 配置与 @ 提示

### 现象

聊天框输入 `@` 时没有完整 Agent 提示，自建 Agent 配置也不够清晰。

### 修复

- `MessageInput` 使用全局 Agent 列表。
- 当前会话 Agent 置顶。
- 支持键盘上下选择、Enter 插入、Esc 关闭。
- Agent 配置抽屉区分内置、自建和 CLI Runtime。
- 自建 Agent 保存后刷新全局列表。

## 7. Artifact 与移动端预览

### 现象

Artifact 主要是 Edit / Download，移动端打开大 Modal 体验差。

### 修复

- Artifact 增加 preview / edit 模式。
- 桌面端可编辑，移动端默认只读预览。
- Web / Document / Slides / Code / Attachment 分别定义展示策略。
- Artifact 列表显示类型、版本、更新时间和 workspace 绑定。

## 8. 文档交付补齐

### 问题

原始产品文档和 AI 协作记录偏薄，不足以对应评分维度。

### 修复

- 产品设计拆成独立分册。
- 技术文档拆成架构、流程、安全和数据分册。
- AI 协作记录拆成 rules / prompts、开发日志、评分证据。
- 根文档保留总览，详细内容放入 `docs/` 子目录。
