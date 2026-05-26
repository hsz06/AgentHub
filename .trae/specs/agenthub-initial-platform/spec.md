# AgentHub 初始平台实现 Spec

## Why
构建一个基于IM聊天范式的多Agent协作平台，让用户可以像使用日常聊天软件一样与多个AI Agent进行单聊和群聊协作，通过对话式交互快速创建网页、代码等产物。

## What Changes
- 初始化前后端完整项目工程结构
- 实现IM聊天核心交互体验（会话列表 + 聊天消息流）
- 搭建统一Agent适配器层并接入至少2个主流AI Agent
- 实现Orchestrator协调器支持群聊多Agent协作
- 实现富媒体产物内联预览卡片
- **BREAKING**: 全新项目创建，无现有代码影响

## Impact
- Affected specs: 全栈工程初始化、IM聊天系统、多Agent调度系统
- Affected code: frontend/ 前端React项目，backend/ 后端Express项目

## ADDED Requirements

### Requirement: 项目工程化基础
The system SHALL provide完整的前后端全栈工程化基础设施。

#### Scenario: 项目初始化完成
- **WHEN** 开发者克隆项目后执行 npm install 分别在前后端目录
- **THEN** 所有依赖正确安装，项目可以正常启动开发服务器

### Requirement: IM聊天核心交互
The system SHALL提供类似主流IM软件的流畅聊天体验。

#### Scenario: 单聊完整流程
- **WHEN** 用户新建会话、选择一个Agent、发送消息
- **THEN** 消息实时出现在聊天流中，Agent接收上下文后返回回复流式打字机效果的消息

### Requirement: 上下文与Token管理机制
The system SHALL具备智能的上下文截断与压缩策略，防止长对话突破LLM的Token上限。

#### Scenario: 长对话内存管理
- **WHEN** 对话历史过长或包含大量代码Diff导致Token超限
- **THEN** 系统自动执行FIFO截断或触发大模型 Summarize（摘要）机制，保留最近关键上下文

### Requirement: 多Agent适配器层
The system SHALL通过统一接口屏蔽不同AI平台API差异。

#### Scenario: 接入新Agent
- **WHEN** 开发者实现一个新的Agent适配器类
- **THEN** 该Agent无需修改其他代码即可在平台中正常使用

### Requirement: Orchestrator群聊协作
The system SHALL支持在一个对话中多个Agent依次（或通过接力模式）协作完成任务，并处理数据流向。

#### Scenario: 群聊多Agent接力回复
- **WHEN** 用户在群聊会话中发送一条包含多个@Agent的复杂指令
- **THEN** Orchestrator自动拆分任务，前置Agent的输出将作为后置Agent的有效上下文输入（接力模式），最终聚合呈现在聊天流中

### Requirement: 产物内联预览
The system SHALL支持在聊天消息中直接展示富媒体产物预览卡片，并确保运行环境的安全性。

#### Scenario: 预览网页产物（沙箱隔离）
- **WHEN** Agent回复中包含网页生成产物
- **THEN** 聊天流中自动展示可交互的iframe预览卡片，且该iframe启用严格的 Sandbox 限权机制，防止XSS及主站数据泄漏
