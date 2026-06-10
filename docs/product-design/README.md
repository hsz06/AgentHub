# AgentHub 产品设计文档

本目录是 AgentHub 的产品设计分册，用于回答 “这个产品解决什么问题、用户如何使用、功能边界是什么、如何验收”。

## 文档结构

|文件|说明|
|---|---|
|[01-product-vision.md](01-product-vision.md)|产品定位、目标用户、核心价值、非目标|
|[02-user-journeys.md](02-user-journeys.md)|单聊、群聊、产物预览、移动端审批等核心用户旅程|
|[03-feature-scope-and-acceptance.md](03-feature-scope-and-acceptance.md)|P0 / P1 / P2 功能范围、验收口径和评分维度映射|

## 产品一句话

AgentHub 是一个以 IM 聊天为核心交互方式的多 Agent 协作平台。用户像拉群聊天一样组织 Claude Code、Codex、OpenCode 和自建 Agent，让它们围绕同一个 workspace 生成代码、文档、网页预览和部署产物。

## 与交付物的关系

- 根目录 `AgentHub- 多Agent协作平台设计.md` 是总览版。
- 本目录是详细版，用于答辩、评审和后续继续实现。
- 技术实现细节见 `docs/technical-design/`。
- AI 协作过程和规则见 `docs/ai-collaboration/`。
