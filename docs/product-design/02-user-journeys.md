# 02. 用户旅程与页面体验

## 1. 页面信息架构

```text
AgentHub Web
├─ 左侧会话栏
│  ├─ 搜索
│  ├─ 新建会话
│  ├─ 单聊 / 群聊列表
│  └─ 归档 / 删除
├─ 中央聊天区
│  ├─ 会话标题
│  ├─ Agent 状态
│  ├─ 消息流
│  ├─ Diff / Artifact / Deployment 卡片
│  └─ 消息输入框
├─ 右侧工作台
│  ├─ Workspace 文件树
│  ├─ 文件搜索
│  ├─ Monaco 预览 / 编辑
│  └─ 提交修改审批
└─ 控制中心
   ├─ 模型服务
   ├─ CLI Runtime
   ├─ Workspace
   ├─ Artifact
   ├─ Approval
   ├─ Deployment
   └─ Agent Run
```

## 2. 旅程 A：单 Agent 代码修改

### 目标

用户希望让 Claude Code CLI 修改一个本机项目文件，但不希望 AI 直接覆盖正式目录。

### 流程

1. 用户打开 AgentHub Web。
2. 新建 “Claude Code CLI 对话”。
3. 在 Control Center 创建或导入 workspace。
4. 把 workspace 绑定到当前会话。
5. 用户输入：

```text
请阅读 README，补充本机启动说明。
```

6. Claude Code CLI 在临时 workspace 副本中运行。
7. Agent 返回修改摘要。
8. 平台生成 Diff 审批。
9. 用户预览 Diff。
10. 用户批准后正式 workspace 写入变更。

### 验收点

- 没绑定 workspace 时，CLI Agent 明确提示需要绑定。
- Agent 运行状态在聊天流或 Agent Run 中可见。
- 审批前正式 workspace 不变。
- 审批后文件内容更新。
- 失败时消息状态变为 failed，而不是一直 streaming。

## 3. 旅程 B：群聊多 Agent 协作

### 目标

用户希望多个 Agent 分工完成一个复杂任务，例如生成页面、补接口、写测试和写文档。

### 流程

1. 用户新建群聊。
2. 选择 Orchestrator、前端 Agent、后端 Agent、测试 Agent、文档 Agent。
3. 用户输入：

```text
@Orchestrator 帮我做一个任务管理页面，需要新增、删除、筛选、预览和 README 使用说明。
```

4. Orchestrator 拆解任务。
5. 前端 Agent 生成页面方案。
6. CLI Agent 修改 workspace。
7. 测试 Agent 提出构建和手工验收点。
8. 文档 Agent 更新说明。
9. Orchestrator 汇总结果和剩余风险。

### 验收点

- 群聊成员在会话中可见。
- `@` 提示显示全局 Agent，当前会话 Agent 置顶。
- Orchestrator 生成可理解的任务拆分。
- 子 Agent 回复能回到同一条会话流。
- 失败的子任务不会阻塞所有任务，能显示降级说明。

## 4. 旅程 C：Artifact 预览与编辑

### 目标

用户希望查看 Agent 生成的网页、文档、代码或附件，并根据需要保存新版本或下载。

### 流程

1. Agent 生成 Artifact。
2. 聊天流显示 Artifact 卡片。
3. 用户点击 Preview。
4. 桌面端打开 Artifact Workspace。
5. Web Artifact 使用 iframe 预览。
6. Document Artifact 使用 Markdown 渲染。
7. Slides Artifact 使用只读幻灯片预览。
8. Code / Attachment Artifact 以只读文本或下载为主。
9. 桌面端允许编辑支持的 Artifact 并保存新版本。

### 验收点

- Artifact 列表显示类型、版本、更新时间、workspace 绑定信息。
- 移动端默认只读预览，不强制打开复杂编辑器。
- 下载、PPTX 导出、静态发布入口可用。
- 保存新版本后版本号更新。

## 5. 旅程 D：移动端轻量审批

### 目标

用户在手机上不写代码，只处理审批和查看产物。

### 流程

1. 用户打开移动端 Web。
2. 底部导航展示 “会话 / 审批 / 产物 / 更多”。
3. 用户进入审批列表。
4. 打开 Diff 只读预览。
5. 用户批准或拒绝。
6. 返回聊天流查看 Agent 后续反馈。

### 验收点

- 底部导航固定可见。
- 抽屉和内容区不超过 `100dvh`。
- Diff 可读，不横向撑爆。
- 控制中心高级配置收敛到 “更多”。

## 6. 关键页面状态

|状态|设计要求|
|---|---|
|未登录|显示项目价值、登录入口、Demo 默认账号提示|
|空会话|提示新建会话或选择 Agent|
|未绑定 workspace|CLI 输入前提示绑定 workspace|
|Agent 运行中|展示运行状态、可停止、可查看日志|
|审批待处理|卡片显示变更摘要和主操作|
|Artifact 为空|引导用户通过 Agent 生成或导入产物|
|离线 / API 失败|展示可读错误，不静默失败|

## 7. 体验原则

1. IM 主区优先，工作台按需打开，不能把聊天挤成不可读。
2. 高风险操作必须显式审批。
3. 移动端只做轻操作，不强行复制桌面 IDE。
4. 所有 Agent 产物都要能追溯到原始会话。
5. 技术术语可以保留，但操作文案优先中文。
