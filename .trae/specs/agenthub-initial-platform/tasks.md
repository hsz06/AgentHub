# Tasks

- [ ] Task 1: 初始化前端React+Vite+TypeScript项目
  - [ ] SubTask 1.1: 使用Vite创建React+TS项目模板在frontend目录
  - [ ] SubTask 1.2: 安装并配置Ant Design 5.x、react-router-dom、zustand等核心依赖
  - [ ] SubTask 1.3: 配置ESLint、Prettier等工程化工具
  - [ ] SubTask 1.4: 验证前端项目可以正常启动运行

- [ ] Task 2: 初始化后端Express+TypeScript+Prisma项目
  - [ ] SubTask 2.1: 在backend目录创建Node.js+Express+TS基础项目
  - [ ] SubTask 2.2: 安装Prisma ORM并配置SQLite数据库连接
  - [ ] SubTask 2.3: 安装Socket.io、cors、dotenv等核心依赖
  - [ ] SubTask 2.4: 配置后端启动脚本并验证服务正常运行

- [ ] Task 3: 数据库Schema设计与迁移
  - [ ] SubTask 3.1: 设计User、Conversation、Message、Agent等核心表的Prisma Schema
  - [ ] SubTask 3.2: 生成初始数据库迁移脚本
  - [ ] SubTask 3.3: 执行迁移创建数据库表结构
  - [ ] SubTask 3.4: 插入几个预置的演示Agent数据

- [ ] Task 4: 前端左侧会话列表组件实现
  - [ ] SubTask 4.1: 实现会话列表UI布局（头像、名称、最新消息、时间）
  - [ ] SubTask 4.2: 实现新建会话弹窗组件（支持选择Agent）
  - [ ] SubTask 4.3: 实现置顶/归档会话功能
  - [ ] SubTask 4.4: 实现会话搜索功能

- [ ] Task 5: 前端聊天主界面与消息流组件
  - [ ] SubTask 5.1: 实现三栏式主布局（会话列表+聊天区+右侧面板占位）
  - [ ] SubTask 5.2: 实现消息流滚动自动到底部组件
  - [ ] SubTask 5.3: 实现消息气泡组件（区分用户消息和Agent消息）
  - [ ] SubTask 5.4: 实现Markdown渲染与代码块高亮

- [ ] Task 6: 后端RESTful API基础接口开发
  - [ ] SubTask 6.1: 实现会话列表CRUD接口
  - [ ] SubTask 6.2: 实现消息列表加载接口
  - [ ] SubTask 6.3: 实现Agent列表查询接口
  - [ ] SubTask 6.4: 添加全局错误处理与CORS配置

- [ ] Task 7: Socket.io实时消息通信通道
  - [ ] SubTask 7.1: 配置后端Socket.io服务并集成到Express
  - [ ] SubTask 7.2: 实现前端Socket.io客户端连接管理
  - [ ] SubTask 7.3: 实现消息发送与实时推送的事件协议
  - [ ] SubTask 7.4: 验证前后端Socket.io双向通信正常

- [ ] Task 8: Agent统一适配器抽象层实现
  - [ ] SubTask 8.1: 定义BaseAgent适配器抽象基类（chat方法、能力标签等接口）
  - [ ] SubTask 8.2: 实现Agent管理器类（Agent注册、获取、调度）
  - [ ] SubTask 8.3: 设计Agent配置数据模型（System Prompt、参数等）

- [ ] Task 9: 接入OpenAI GPT系列Agent
  - [ ] SubTask 9.1: 集成OpenAI Node.js SDK
  - [ ] SubTask 9.2: 实现OpenAIAgent适配器类继承BaseAgent
  - [ ] SubTask 9.3: 配置API密钥环境变量读取
  - [ ] SubTask 9.4: 测试调用OpenAI接口返回正常回复

- [ ] Task 10: 接入Claude Anthropic Agent
  - [ ] SubTask 10.1: 集成Anthropic Claude Node.js SDK
  - [ ] SubTask 10.2: 实现ClaudeAgent适配器类继承BaseAgent
  - [ ] SubTask 10.3: 配置Claude API密钥环境变量
  - [ ] SubTask 10.4: 测试Claude Agent对话功能正常

- [ ] Task 11: Orchestrator协调器核心逻辑开发
  - [ ] SubTask 11.1: 实现意图理解模块
  - [ ] SubTask 11.2: 实现任务拆解与子Agent分派逻辑
  - [ ] SubTask 11.3: 实现多Agent调度执行器
  - [ ] SubTask 11.4: 实现结果聚合与输出格式化

- [ ] Task 12: 群聊模式与@提及功能
  - [ ] SubTask 12.1: 扩展Conversation模型支持多Agent成员
  - [ ] SubTask 12.2: 实现消息输入框的@提及选择器组件
  - [ ] SubTask 12.3: 后端解析消息中的@Agent标记
  - [ ] SubTask 12.4: 群聊模式下多个Agent依次回复聊天流展示

- [ ] Task 13: 产物预览卡片组件系统
  - [ ] SubTask 13.1: 设计通用富媒体消息卡片组件容器
  - [ ] SubTask 13.2: 实现网页预览卡片（iframe可交互容器）
  - [ ] SubTask 13.3: 实现代码Diff视图卡片
  - [ ] SubTask 13.4: 卡片点击展开全屏预览模态框

- [ ] Task 14: 全流程联调与Bug修复
  - [ ] SubTask 14.1: 单聊完整流程端到端测试
  - [ ] SubTask 14.2: 群聊多Agent协作流程联调
  - [ ] SubTask 14.3: 消息实时同步与状态展示优化
  - [ ] SubTask 14.4: 修复发现的所有Bug

# Task Dependencies
- Task 1 and Task 2 can be executed in parallel
- Task 3 depends on Task 2
- Task 4 and Task 5 can be executed in parallel after Task 1
- Task 6 depends on Task 3
- Task 7 depends on Task 2 and Task 6
- Task 8 depends on Task 2
- Task 9 and Task 10 can be executed in parallel after Task 8
- Task 11 depends on Task 9 and Task 10
- Task 12 depends on Task 11 and Task 4
- Task 13 can be executed after Task 5
- Task 14 depends on all previous tasks
