# 04. Spec / Skill / Rules 协作规范

本文档把 “和 AI 协作的 Spec、skill、rules” 从概念拆成可执行规范。后续让 AI 继续开发 AgentHub 时，应优先把本文件作为上下文输入。

## 1. 三类协作资产定义

|资产|定义|在本项目中的作用|产出物|
|---|---|---|---|
|Spec|描述要做什么、为什么做、做到什么程度|约束需求范围，避免 AI 自行脑补产品能力|需求切片、验收标准、边界说明|
|Skill|描述某类任务如何做|让 AI 在重复任务中使用稳定流程|诊断流程、前端优化流程、文档补齐流程|
|Rules|描述任何任务都必须遵守的硬约束|保护代码质量、安全边界和交付可信度|禁止项、检查项、验证门槛|

三者关系：

```text
Spec 决定目标
  → Skill 决定做法
  → Rules 决定边界
  → Verification 决定是否完成
```

## 2. Spec 规范

### 2.1 Spec 最小模板

每个新需求都必须先整理成以下结构：

```text
需求标题：

背景：
- 用户遇到什么问题？
- 当前系统哪里不满足？

目标：
- 本次要达成什么可观察结果？

非目标：
- 本次明确不做什么？

影响范围：
- 前端：
- 后端：
- 数据库：
- 文档：
- 安全边界：

验收标准：
1. ...
2. ...
3. ...

验证方式：
- 命令：
- 手工操作：
- 需要截图 / Demo 的地方：
```

### 2.2 AgentHub 需求切片示例

```text
需求标题：
修复聊天消息竖排，并让工作台点击后再出现。

背景：
- 1366px 桌面宽度下，右侧工作台挤压聊天主区。
- 中文消息按单字换行，IM 核心体验不可用。

目标：
- 默认隐藏工作台。
- 点击“工作台”后再打开。
- 聊天消息保持正常段落宽度。

非目标：
- 不重做整体视觉主题。
- 不引入新的 UI 框架。
- 不改后端 API。

影响范围：
- 前端：ChatPage、index.css、WorkspaceWorkbench。
- 后端：无。
- 数据库：无。
- 文档：如影响验收体验，需要更新产品 / 技术文档。
- 安全边界：无。

验收标准：
1. 1366x768 下聊天消息不竖排。
2. 工作台默认不常驻占宽。
3. 点击工作台按钮可以打开文件工作台。
4. 窄屏下不横向溢出。

验证方式：
- `cd frontend && PATH=/home/hsz/software/node/bin:$PATH npm run build`
- 浏览器手工验证 1366x768 和窄屏。
```

### 2.3 Spec 分级规则

|等级|定义|处理方式|
|---|---|---|
|P0|影响可运行 Demo 主链路|必须优先实现并验证|
|P1|影响完整产品体验|在 P0 稳定后实现|
|P2|增强体验或展示价值|可以文档化，不阻塞主 Demo|
|Out of Scope|生产化或过度扩展|记录为后续方向，不在本轮实现|

### 2.4 Spec 完成标准

一个 Spec 只有满足以下条件才算可交给 AI 编码：

- 有明确用户问题。
- 有目标和非目标。
- 有影响范围。
- 有可执行验收标准。
- 明确是否影响 workspace、审批、Runner 或数据模型。
- 明确验证命令或手工验证步骤。

## 3. Skill 规范

Skill 是可复用工作流，不是泛泛的 “让 AI 写代码”。AgentHub 当前沉淀以下 Skill。

### 3.1 Diagnose Skill：故障诊断

适用场景：

- “没返回”
- “按钮点不动”
- “模型报 400”
- “CLI 运行了但没有输出”
- “页面溢出”

流程：

```text
1. Reproduce：确认现象和输入。
2. Locate：判断属于前端、后端、Runtime、Provider、数据库还是文档。
3. Inspect：读取最小相关代码，不全仓库乱改。
4. Hypothesis：提出 1-2 个最可能原因。
5. Fix：做最小修改。
6. Verify：运行 build / smoke / 手工验证。
7. Record：把原因和修复点写入开发日志。
```

输出格式：

```text
问题：
根因：
修改：
验证：
剩余风险：
```

### 3.2 Frontend UX Skill：前端体验修复

适用场景：

- 布局挤压
- 内容超出页面
- 移动端不可用
- Artifact / Control Center / 工作台体验差

规则：

- 先修可用性，再修视觉。
- IM 主区优先级高于工作台常驻。
- 窄屏不加载复杂编辑器。
- 抽屉、Tab、列表必须 `min-height: 0` 和局部滚动。
- 不为一个问题引入新 UI 框架。

验收：

```text
1. 1366x768 桌面可用。
2. 390px 左右窄屏不横向溢出。
3. 主操作按钮可见可点击。
4. npm run build 通过。
```

### 3.3 Runtime Integration Skill：CLI Runtime 接入

适用场景：

- Claude Code / Codex / OpenCode 执行问题
- Runtime 配置问题
- CLI 输出解析问题

规则：

- executable path 优先，不复制二进制。
- Claude Code 默认复用本机 OAuth。
- Runtime Test 使用 `<binary> --version`。
- stdout / stderr 必须保留到运行日志。
- JSON Lines 解析必须支持 chunk buffer。
- 有真实文本输出时，不用占位文案覆盖。

验收：

```text
1. Runtime Test 成功。
2. CLI Run 有 started / completed / failed 状态。
3. stdout 文本能进入 Agent 消息。
4. 文件修改能生成 Diff Approval。
```

### 3.4 Documentation Skill：答辩文档补齐

适用场景：

- 产品设计薄
- 技术文档缺少代码映射
- AI 协作记录笼统
- 验收证据不足

流程：

```text
1. 从考察要点反推文档结构。
2. 每个评分维度至少给出一个具体证据。
3. 每个能力区分已实现、Demo 边界和后续方向。
4. 给出代码入口或验证命令。
5. 不处理用户明确排除的内容，例如本轮不管视频。
```

验收：

- 产品文档能说明用户旅程和验收口径。
- 技术文档能说明核心链路和代码入口。
- AI 协作记录能说明 Spec、Skill、Rules 如何被使用。

### 3.5 Review Skill：改动审查

适用场景：

- 完成一个功能切片后
- 修改 Runtime / 审批 / workspace 等高风险模块后

检查项：

```text
1. 是否满足 Spec 验收标准？
2. 是否改了无关文件？
3. 是否绕过审批边界？
4. 是否引入 shell 注入或任意命令执行？
5. 是否需要数据库迁移？
6. 是否需要更新文档？
7. 是否运行了对应 build / check？
```

## 4. Rules 规范

### 4.1 硬性禁止项

|禁止项|原因|
|---|---|
|未审批直接写正式 workspace|破坏核心安全边界|
|CLI 命令通过 shell 字符串拼接|存在命令注入风险|
|为了 Demo 把 API Key 写入代码或文档|泄露密钥|
|把本机 Runner 描述成生产级沙箱|能力夸大|
|为了修 UI 重写整个前端架构|超出需求且风险大|
|删除用户未要求删除的文件或改动|破坏协作上下文|
|构建未验证就声明完成|交付不可信|

### 4.2 必须检查项

每次任务结束前必须检查：

```text
需求是否满足：
验证是否完成：
文档是否需要同步：
安全边界是否受影响：
数据库是否需要迁移：
用户还需要知道什么风险：
```

### 4.3 代码修改边界

|改动类型|允许范围|必须验证|
|---|---|---|
|前端样式|相关组件和 `index.css`|frontend build|
|前端交互|组件和 API service|frontend build + 手工流程|
|后端 service|相关 controller / service / socket|backend build|
|Prisma schema|schema + migration + generated client|prisma validate / generate / backend build|
|Runtime|Adapter、CliAgent、Worker|runtime test + backend build|
|文档|相关 docs|git diff --check|

## 5. AI 任务卡模板

后续每个 AI 开发任务建议使用以下任务卡：

```text
任务：

Spec：
- 背景：
- 目标：
- 非目标：
- 验收标准：

使用 Skill：
- Diagnose / Frontend UX / Runtime Integration / Documentation / Review

必须遵守 Rules：
- ...

涉及文件：
- ...

验证：
- ...

完成后记录到：
- docs/ai-collaboration/02-development-log.md
```

## 6. 本项目已使用示例

|问题|使用的 Spec / Skill / Rules|结果|
|---|---|---|
|去 Docker 本机运行|Runtime Integration Skill + Runner 安全 Rules|改为 executable path，保留临时 workspace 和审批|
|Claude Code 有输出但前端显示无文件变化|Diagnose Skill + Runtime 输出 Rules|修复 JSON Lines 解析和消息文本提取|
|聊天消息竖排|Frontend UX Skill|工作台默认点击打开，消息宽度恢复|
|自建 Agent 400 messages 为空|Diagnose Skill + Provider 配置 Spec|修复 token 预算和 Provider 默认模型使用|
|交付文档不足|Documentation Skill|拆分产品、技术、AI 协作三类详细文档|

## 7. 答辩表述

可以这样解释本项目的 AI 协作能力：

```text
我们没有只把 AI 当成代码生成器，而是把 AI 协作过程规范化为三层：

第一层是 Spec：每个需求先写清目标、非目标、影响范围和验收标准。
第二层是 Skill：把诊断、前端优化、Runtime 接入、文档补齐等重复任务沉淀成固定流程。
第三层是 Rules：任何 AI 改动都必须遵守审批边界、命令白名单、最小修改和构建验证。

因此 AI 在项目里不是随意发挥，而是在可检查的规则内完成工程任务。
```
