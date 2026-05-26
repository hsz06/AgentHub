import { useState, useEffect } from 'react';
import { Layout, Avatar, Typography, message, Tabs, Badge } from 'antd';
import { CloseOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import SessionList from '../components/SessionList';
import MessageFlow from '../components/MessageFlow';
import MessageInput from '../components/MessageInput';
import NewSessionModal from '../components/NewSessionModal';
import { Session, Message, Agent } from '../types';
import dayjs from 'dayjs';
import { CodeOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Sider, Content } = Layout;
const { Title } = Typography;

const PRESET_AGENTS: Agent[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic出品，擅长复杂长代码分析',
    tags: ['长文本处理', '复杂推理', '安全代码'],
    iconType: 'RobotOutlined',
    color: '#8B5CF6',
  },
  {
    id: 'gpt-code',
    name: 'GPT Code',
    description: 'OpenAI出品，通用编程专家',
    tags: ['快速响应', '全栈开发', 'Bug修复'],
    iconType: 'CodeOutlined',
    color: '#10B981',
  },
  {
    id: 'open-code',
    name: 'OpenCode',
    description: '开源本地模型，高性能代码生成',
    tags: ['本地运行', '高效生成', '隐私保护'],
    iconType: 'ThunderboltOutlined',
    color: '#F59E0B',
  },
];

const IconMap: Record<string, React.FC<any>> = {
  'CodeOutlined': CodeOutlined,
  'RobotOutlined': RobotOutlined,
  'ThunderboltOutlined': ThunderboltOutlined,
};

const ChatPage: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});
  const [agents] = useState<Agent[]>(PRESET_AGENTS);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
  const [newSessionModalVisible, setNewSessionModalVisible] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [replyQuoteContent, setReplyQuoteContent] = useState<string>('');

  useEffect(() => {
    const demoSessions: Session[] = [
      {
        id: 's1',
        name: '全类型消息展示',
        agentIds: ['claude-code'],
        type: 'single',
        lastMessage: '7种消息类型全部演示完毕...',
        lastActiveAt: dayjs().subtract(5, 'minute').toISOString(),
        isPinned: true,
        isArchived: false,
        unreadCount: 0,
      },
      {
        id: 's2',
        name: '代码协作群聊',
        agentIds: ['claude-code', 'gpt-code', 'open-code'],
        type: 'group',
        lastMessage: '这段代码可以这样优化...',
        lastActiveAt: dayjs().subtract(2, 'hour').toISOString(),
        isPinned: false,
        isArchived: false,
        unreadCount: 0,
      },
      {
        id: 's3',
        name: '归档的历史对话',
        agentIds: ['gpt-code'],
        type: 'single',
        lastMessage: '这个是很早之前的会话...',
        lastActiveAt: dayjs().subtract(7, 'day').toISOString(),
        isPinned: false,
        isArchived: true,
        unreadCount: 0,
      },
    ];
    setSessions(demoSessions);

    const demoMessagesS1: Message[] = [
      {
        id: 'm1',
        sessionId: 's1',
        senderId: 'user',
        senderName: '我',
        content: '请帮我创建一个精美的登录页面组件',
        type: 'user',
        createdAt: dayjs().subtract(8, 'minute').toISOString(),
        isPinned: true,
      },
      {
        id: 'm2',
        sessionId: 's1',
        senderId: 'claude-code',
        senderName: 'Claude Code',
        type: 'agent',
        createdAt: dayjs().subtract(7, 'minute').toISOString(),
        content: '✅ **AgentHub 全类型消息支持演示**\n\n### 1. 纯文本消息\n这是一条普通的纯文本消息，支持换行和基础格式。\n\n💡 这条关键消息已被您Pin为长期上下文，后续所有对话Agent都会自动引用它！',
        isPinned: true,
      },
      {
        id: 'm3',
        sessionId: 's1',
        senderId: 'claude-code',
        senderName: 'Claude Code',
        type: 'agent',
        createdAt: dayjs().subtract(6, 'minute').toISOString(),
        content: '### 2. 代码块消息\n```typescript\ninterface MessageType {\n  id: string;\n  type: \'text\' | \'code\' | \'image\' | \'file\' | \'preview\';\n  content: string;\n}\nconsole.log("Hello TypeScript!");\n```',
      },
      {
        id: 'm4',
        sessionId: 's1',
        senderId: 'claude-code',
        senderName: 'Claude Code',
        type: 'agent',
        createdAt: dayjs().subtract(5, 'minute').toISOString(),
        content: '### 3. 网页预览卡片',
        metadata: {
          preview_cards: [
            {
              type: 'web-preview',
              title: '登录页面预览',
              description: '点击全屏查看完整交互效果',
              data: {
                htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 300px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; }
    h1 { color: white; font-size: 32px; font-family: system-ui; }
  </style>
</head>
<body><h1>AgentHub 网页预览 ✨</h1></body>
</html>`,
              },
            },
          ],
        },
      },
      {
        id: 'm5',
        sessionId: 's1',
        senderId: 'claude-code',
        senderName: 'Claude Code',
        type: 'agent',
        createdAt: dayjs().subtract(4, 'minute').toISOString(),
        content: '### 4. Code Diff 视图卡片',
        metadata: {
          preview_cards: [
            {
              type: 'code-diff',
              title: 'App.tsx 修改',
              description: '优化组件结构',
              data: {
                fileName: 'src/App.tsx',
                oldCode: `export default function App() {\n  return <div>Hello</div>\n}`,
                newCode: `import { Layout } from 'antd'\nexport default function App() {\n  return <Layout style={{ height: '100vh' }}>...</Layout>\n}`,
                language: 'tsx',
              },
            },
          ],
        },
      },
      {
        id: 'm6',
        sessionId: 's1',
        senderId: 'claude-code',
        senderName: 'Claude Code',
        type: 'agent',
        createdAt: dayjs().subtract(3, 'minute').toISOString(),
        content: '### 5. 图片预览卡片',
        metadata: {
          preview_cards: [
            {
              type: 'image',
              title: '示例图片',
              description: '支持点击放大预览',
              data: {
                imageUrl: 'https://picsum.photos/320/180',
              },
            },
          ],
        },
      },
      {
        id: 'm7',
        sessionId: 's1',
        senderId: 'claude-code',
        senderName: 'Claude Code',
        type: 'agent',
        createdAt: dayjs().subtract(2, 'minute').toISOString(),
        content: '### 6. 文件附件卡片',
        metadata: {
          preview_cards: [
            {
              type: 'file-attachment',
              title: '项目源码包',
              description: 'zip压缩包',
              data: {
                fileName: 'agenthub-v1.0.0.zip',
                fileSize: '12.5 MB',
                fileType: 'ZIP 压缩包',
              },
            },
          ],
        },
      },
      {
        id: 'm8',
        sessionId: 's1',
        senderId: 'claude-code',
        senderName: 'Claude Code',
        type: 'agent',
        createdAt: dayjs().subtract(1, 'minute').toISOString(),
        content: '### 7. 部署状态卡片\n所有7种消息类型已全部展示完毕！🎉\n\n🎯 **关键消息Pin功能**: 顶部「长期上下文」区域展示了您固定的2条关键消息，它们会被永远保留为Agent上下文，不会被截断！',
        metadata: {
          preview_cards: [
            {
              type: 'deployment-status',
              title: 'AgentHub 正式部署',
              description: '构建部署进度',
              data: {
                status: 'success',
                progress: 100,
                deployUrl: 'https://demo.agenthub.dev',
              },
            },
          ],
        },
      },
    ];

    const demoMessagesS2: Message[] = [
      {
        id: 'm9',
        sessionId: 's2',
        senderId: 'user',
        senderName: '我',
        content: '@Claude Code @GPT Code 请帮我优化这段代码的性能',
        type: 'user',
        createdAt: dayjs().subtract(3, 'hour').toISOString(),
      },
    ];

    setAllMessages({
      s1: demoMessagesS1,
      s2: demoMessagesS2,
    });

    setOpenSessionIds(['s1', 's2']);
    setSelectedSessionId('s1');
  }, []);

  const simulateMultiAgentReply = async (
    sessionId: string,
    targetAgentIds: string[],
    originalUserContent: string
  ) => {
    setIsProcessing(true);
    const replies = [
      {
        agentId: 'claude-code',
        agentName: 'Claude Code',
        content: '我收到了您的优化需求，正在进行深度代码分析...\n\n**第一步: 识别性能瓶颈**\n- 发现了3个可优化的循环冗余计算点\n- 建议引入惰性加载策略',
      },
      {
        agentId: 'gpt-code',
        agentName: 'GPT Code',
        content: '基于Claude的分析结果，我来提供具体的重构代码：\n\n```tsx\n// 优化前\nconst result = arr.map(x => x * 2).filter(x => x > 100)\n\n// 优化后 - 使用单次遍历\nconst result: number[] = []\nfor (const x of arr) {\n  const val = x * 2\n  if (val > 100) result.push(val)\n}\nconsole.log("性能提升约 40%")\n```',
      },
      {
        agentId: 'open-code',
        agentName: 'OpenCode',
        content: '接力完成！我来做最终的安全性校验...\n\n✅ 所有代码通过了静态检查\n✅ 没有内存泄漏风险\n✅ 已为您生成完整的单元测试用例\n\n**多Agent协作任务全部完成！**',
      },
    ];

    for (const reply of replies) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const msg: Message = {
        id: `msg-${Date.now()}`,
        sessionId,
        senderId: reply.agentId,
        senderName: reply.agentName,
        type: 'agent',
        content: reply.content,
        createdAt: new Date().toISOString(),
      };
      setAllMessages((prev) => ({
        ...prev,
        [sessionId]: [...(prev[sessionId] || []), msg],
      }));
    }

    setIsProcessing(false);
    message.success('多Agent群聊协作完成！');
  };

  const handleReply = (msg: Message) => {
    setReplyQuoteContent(`> ${msg.senderName}:\n> ${msg.content.split('\n')[0]}\n\n`);
  };

  const handleRegenerate = async (msg: Message) => {
    message.info('正在重新生成该消息...');
    await new Promise(resolve => setTimeout(resolve, 1500));
    message.success('消息已重新生成！');
  };

  const handleTogglePinMessage = (msgId: string) => {
    setAllMessages((prev) => {
      const targetMessages = prev[selectedSessionId || ''] || [];
      const targetMsg = targetMessages.find(m => m.id === msgId);
      const newIsPinned = !targetMsg?.isPinned;
      return {
        ...prev,
        [selectedSessionId || '']: targetMessages.map(m => 
          m.id === msgId ? { ...m, isPinned: newIsPinned } : m
        ),
      };
    });
  };

  const handleApplyDiff = (diffData: any) => {
    message.success(`Diff已一键应用到 ${diffData.fileName}！`);
  };

  const handleSelectSession = (session: Session) => {
    if (!session.isArchived && !openSessionIds.includes(session.id)) {
      setOpenSessionIds([...openSessionIds, session.id]);
    }
    setSelectedSessionId(session.id);
    setReplyQuoteContent('');
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, unreadCount: 0 } : s))
    );
  };

  const handleCloseSessionTab = (sessionId: string) => {
    const newOpenIds = openSessionIds.filter((id) => id !== sessionId);
    setOpenSessionIds(newOpenIds);
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(newOpenIds.length > 0 ? newOpenIds[newOpenIds.length - 1] : null);
    }
  };

  const handlePinSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, isPinned: !s.isPinned } : s
      )
    );
  };

  const handleArchiveSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, isArchived: true } : s
      )
    );
    handleCloseSessionTab(sessionId);
    message.success('会话已归档');
  };

  const handleUnarchiveSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, isArchived: false } : s
      )
    );
    message.success('会话已从归档中恢复');
  };

  const handleCreateSession = (type: 'single' | 'group') => {
    if (selectedAgentIds.length === 0) return;
    const selectedAgents = agents.filter((a) =>
      selectedAgentIds.includes(a.id)
    );
    const newSession: Session = {
      id: `session-${Date.now()}`,
      name: type === 'single' 
        ? `${selectedAgents[0].name} 对话` 
        : `${selectedAgents.map((a) => a.name).join(' & ')} 协作`,
      agentIds: selectedAgentIds,
      type,
      lastMessage: '',
      lastActiveAt: new Date().toISOString(),
      isPinned: false,
      isArchived: false,
      unreadCount: 0,
    };
    setSessions((prev) => [newSession, ...prev]);
    setAllMessages((prev) => ({ ...prev, [newSession.id]: [] }));
    const newOpenIds = [...openSessionIds, newSession.id];
    setOpenSessionIds(newOpenIds);
    setSelectedSessionId(newSession.id);
    setNewSessionModalVisible(false);
    setSelectedAgentIds([]);
    message.success(type === 'single' ? '单聊创建成功' : '群聊创建成功');
  };

  const handleSendMessage = (content: string) => {
    if (!selectedSessionId || isProcessing) return;
    const fullContent = replyQuoteContent ? `${replyQuoteContent}${content}` : content;
    const currentSession = sessions.find(s => s.id === selectedSessionId);
    if (!currentSession) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      sessionId: selectedSessionId,
      senderId: 'user',
      senderName: '我',
      content: fullContent,
      type: 'user',
      createdAt: new Date().toISOString(),
    };
    setAllMessages((prev) => ({
      ...prev,
      [selectedSessionId]: [...(prev[selectedSessionId] || []), newMessage],
    }));
    setReplyQuoteContent('');
    setSessions((prev) =>
      prev.map((s) =>
        s.id === selectedSessionId
          ? { ...s, lastMessage: content, lastActiveAt: new Date().toISOString() }
          : s
      )
    );

    if (currentSession.type === 'group' && currentSession.agentIds.length > 1) {
      message.info('Orchestrator 正在启动多Agent接力协作模式...');
      setTimeout(() => {
        simulateMultiAgentReply(selectedSessionId, currentSession.agentIds, content);
      }, 500);
    } else {
      setTimeout(() => {
        const replyAgentId = currentSession.agentIds[0];
        const replyAgent = agents.find(a => a.id === replyAgentId);
        
        const replyMsg: Message = {
          id: `msg-${Date.now() + 1}`,
          sessionId: selectedSessionId,
          senderId: replyAgentId,
          senderName: replyAgent?.name || 'AI助手',
          content: '收到您的消息！我正在为您分析并提供最佳方案...\n\n```javascript\nconsole.log("Hello AgentHub!")\n```',
          type: 'agent',
          createdAt: new Date().toISOString(),
        };
        
        setAllMessages((prev) => ({
          ...prev,
          [selectedSessionId]: [...(prev[selectedSessionId] || []), replyMsg],
        }));
      }, 800);
    }
  };

  const currentSession = sessions.find((s) => s.id === selectedSessionId);
  const currentMessages = selectedSessionId ? (allMessages[selectedSessionId] || []) : [];

  const sessionTabItems = openSessionIds.map((sid) => {
    const s = sessions.find((ss) => ss.id === sid);
    const firstAgent = s?.agentIds[0] ? agents.find(a => a.id === s.agentIds[0]) : null;
    const IconComponent = firstAgent?.iconType ? IconMap[firstAgent.iconType] : UserOutlined;
    return {
      key: sid,
      label: (
        <Badge dot={s && s.unreadCount > 0} style={{ right: -2, top: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Avatar
              size={24}
              style={{
                backgroundColor: firstAgent?.color || '#1890ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              icon={<IconComponent />}
            />
            <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s?.name || '会话'}
            </span>
            <CloseOutlined
              onClick={(e) => {
                e.stopPropagation();
                handleCloseSessionTab(sid);
              }}
              style={{ fontSize: 12, color: '#999', cursor: 'pointer', padding: 2 }}
            />
          </div>
        </Badge>
      ),
    };
  });

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        width={320}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f5',
          overflow: 'hidden',
        }}
      >
        <SessionList
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={handleSelectSession}
          onPinSession={handlePinSession}
          onArchiveSession={handleArchiveSession}
          onUnarchiveSession={handleUnarchiveSession}
          onOpenNewSession={() => setNewSessionModalVisible(true)}
        />
      </Sider>
      <Layout style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '0 0 0 0',
            borderBottom: '1px solid #f0f0f5',
            backgroundColor: '#fff',
          }}
        >
          {openSessionIds.length > 0 ? (
            <Tabs
              activeKey={selectedSessionId || undefined}
              onChange={(key) => setSelectedSessionId(key)}
              items={sessionTabItems}
              type="card"
              style={{ margin: 0 }}
            />
          ) : (
            <div style={{ padding: '16px 24px', height: 56, display: 'flex', alignItems: 'center' }}>
              <Title level={4} style={{ margin: 0, color: '#999' }}>
                请选择或创建会话
              </Title>
            </div>
          )}
        </div>
        <Content style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedSessionId ? (
            <>
              <MessageFlow 
                messages={currentMessages} 
                onReply={handleReply}
                onRegenerate={handleRegenerate}
                onApplyDiff={handleApplyDiff}
                onTogglePinMessage={handleTogglePinMessage}
              />
              {isProcessing && (
                <div style={{ padding: '12px 24px', backgroundColor: '#e6f4ff', borderTop: '1px solid #bae0ff' }}>
                  <span style={{ color: '#1890ff' }}>⏳ Orchestrator 正在协调多个 Agent 接力协作中...</span>
                </div>
              )}
              {replyQuoteContent && (
                <div style={{ padding: '8px 24px', backgroundColor: '#fff7e6', borderTop: '1px solid #ffd591', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#fa8c16' }}>📌 已引用该消息进行回复</span>
                  <Button type="text" size="small" onClick={() => setReplyQuoteContent('')}>取消引用</Button>
                </div>
              )}
              <MessageInput
                onSendMessage={handleSendMessage}
                disabled={!selectedSessionId || isProcessing}
                agents={agents}
                initialContent={replyQuoteContent}
              />
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f7f8fa',
              }}
            >
              <div style={{ textAlign: 'center', color: '#999' }}>
                <p style={{ fontSize: 16 }}>请从左侧选择一个会话开始聊天</p>
                <p style={{ fontSize: 14, marginTop: 8 }}>
                  点击左下角的「+ 新建会话」按钮创建新的对话
                </p>
              </div>
            </div>
          )}
        </Content>
      </Layout>
      <NewSessionModal
        visible={newSessionModalVisible}
        agents={agents}
        selectedAgentIds={selectedAgentIds}
        onSelectAgents={setSelectedAgentIds}
        onCreateSession={handleCreateSession}
        onCancel={() => {
          setNewSessionModalVisible(false);
          setSelectedAgentIds([]);
        }}
      />
    </Layout>
  );
};

export default ChatPage;
