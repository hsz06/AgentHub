# AgentHub 技术文档

本目录是 AgentHub 的技术设计分册，用于回答 “系统如何实现、核心链路在哪里、风险边界是什么、答辩如何解释代码”。

## 文档结构

|文件|说明|
|---|---|
|[01-architecture-overview.md](01-architecture-overview.md)|总体架构、模块边界、关键设计决策|
|[02-core-flows.md](02-core-flows.md)|消息、Orchestrator、CLI Runtime、审批、Artifact、部署核心流程|
|[03-runtime-security-and-data.md](03-runtime-security-and-data.md)|数据模型、Runner 安全边界、配置、风险和答辩索引|

## 技术一句话

AgentHub 的核心架构是：

```text
React IM UI
  → Express / Socket.io
  → ContextService
  → AgentRuntime / Orchestrator / CliAgent
  → Temporary Workspace
  → ToolApproval
  → Artifact / Deployment
```

根目录 `AgentHub-技术架构设计.md` 是总览版，本目录是详细版。
