# AgentHub - 多Agent协作平台 实现计划

## 项目概述
AgentHub 是一个基于IM聊天范式的多Agent协作平台，用户可以像使用微信/飞书一样与多个AI Agent进行单聊或群聊协作，通过对话式交互快速创建网页、代码、文档等产物。

## 技术栈选型
- **前端**: React + TypeScript + Vite + Ant Design 5.x
- **后端**: Node.js + Express + TypeScript
- **数据库**: SQLite (开发环境) / PostgreSQL (生产环境) + Prisma ORM
- **实时通信**: Socket.io
- **AI接口层**: OpenAI API (兼容多个模型) + 统一适配器模式
- **产物预览**: Iframe + Monaco Editor
- **部署**: Vercel / Docker

---

## 实现阶段划分

### 第一阶段：项目基础架构搭建（第1-2周）
1. 初始化前后端项目结构
2. 配置开发环境、TypeScript、ESLint等工程化设施
3. 搭建数据库Schema设计（会话、消息、Agent定义、用户等核心表）
4. 实现基础的用户认证与会话管理
5. 搭建前后端基础通信框架（RESTful API + Socket.io实时通道）

### 第二阶段：IM聊天核心体验开发（第3-4周）
1. 左侧会话列表组件实现（新建、置顶、归档、搜索）
2. 聊天主界面布局实现（消息流、输入框）
3. 单聊模式完整流程：创建会话、发送消息、接收Agent回复
4. 基础消息类型支持：文本、代码块、Markdown渲染
5. 上下文持久化：聊天历史加载与存储

### 第三阶段：多Agent系统与适配器层（第5周）
1. Agent数据模型设计（头像、名称、能力标签、System Prompt）
2. 统一适配器层抽象定义，屏蔽不同AI平台API差异
3. 接入至少2个主流Agent（如OpenAI GPT系列 + Anthropic Claude）
4. Agent管理界面：内置Agent展示、用户自建Agent创建流程
5. Agent选择器组件：新建会话时选择Agent

### 第四阶段：Orchestrator协调器与群聊模式（第6周）
1. 群聊会话数据模型扩展（多Agent成员关联）
2. @提及功能实现（消息输入中的@Agent）
3. Orchestrator协调器核心逻辑：意图理解、任务拆解、子Agent调度
4. 多Agent依次回复的聊天流展示
5. 简单的并行调度与失败降级处理

### 第五阶段：产物内联预览与编辑（第7-8周）
1. 富媒体消息卡片组件系统设计
2. 网页预览卡片（Iframe容器）
3. 代码Diff视图卡片（差异对比展示）
4. Monaco Editor集成：产物代码全屏编辑
5. 产物操作：复制代码、预览展开

### 第六阶段：增强功能与体验优化（第9周）
1. 消息操作功能：重新生成、引用、回复、Pin消息
2. 聊天搜索与历史回溯优化
3. 消息发送状态展示与重试机制
4. UI/UX细节打磨：动画过渡、响应式布局
5. 错误处理与用户提示完善

### 第七阶段：测试与交付准备（第10周）
1. 全流程功能测试与Bug修复
2. 编写产品使用文档
3. 编写技术架构文档
4. 录制3分钟Demo视频
5. 构建可运行Demo版本

---

## 核心任务清单

| 任务ID | 任务描述 | 优先级 | 预计工时 |
|--------|----------|--------|----------|
| T001 | 初始化前端React+Vite+TS项目 | P0 | 4h |
| T002 | 初始化后端Express+TS+Prisma项目 | P0 | 4h |
| T003 | 数据库Schema设计与迁移脚本 | P0 | 6h |
| T004 | 会话列表组件（新建/置顶/归档） | P0 | 8h |
| T005 | 聊天消息流与输入框组件 | P0 | 8h |
| T006 | Socket.io实时消息通信 | P0 | 6h |
| T007 | Agent统一适配器抽象层 | P0 | 8h |
| T008 | 接入OpenAI GPT Agent | P0 | 6h |
| T009 | 接入Claude Agent | P0 | 6h |
| T010 | Orchestrator协调器核心逻辑 | P0 | 10h |
| T011 | 群聊模式多Agent调度 | P0 | 8h |
| T012 | 产物预览卡片组件 | P1 | 8h |
| T013 | Monaco Editor代码编辑集成 | P1 | 6h |
| T014 | 消息操作（重生成/引用/Pin） | P1 | 6h |
| T015 | 编写产品与技术文档 | P0 | 8h |
| T016 | Demo录制与交付准备 | P0 | 4h |

---

## 目录结构规划

```
AgentHub/
├── frontend/                 # 前端React项目
│   ├── src/
│   │   ├── components/       # 公共组件
│   │   ├── pages/            # 页面
│   │   ├── store/            # 状态管理
│   │   ├── services/         # API服务
│   │   ├── types/            # TypeScript类型定义
│   │   └── utils/            # 工具函数
│   └── package.json
├── backend/                  # 后端Express项目
│   ├── src/
│   │   ├── controllers/      # 控制器
│   │   ├── services/         # 业务逻辑
│   │   │   └── agents/       # Agent适配器实现
│   │   ├── models/           # 数据模型
│   │   ├── routes/           # 路由定义
│   │   ├── sockets/          # Socket.io处理
│   │   └── utils/            # 工具函数
│   ├── prisma/               # Prisma schema
│   └── package.json
├── docs/                     # 文档目录
│   ├── product/              # 产品文档
│   └── tech/                 # 技术文档
└── README.md
```
