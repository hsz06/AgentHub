import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Button, Card, Drawer, Form, Input, Layout, List, Modal, Space, Tabs, Tag, Typography, message as toast } from 'antd';
import { AppstoreOutlined, CloseOutlined, ContactsOutlined, KeyOutlined, LogoutOutlined, RobotOutlined } from '@ant-design/icons';
import type { Socket } from 'socket.io-client';
import SessionList from '../components/SessionList';
import MessageFlow from '../components/MessageFlow';
import MessageInput from '../components/MessageInput';
import NewSessionModal from '../components/NewSessionModal';
import ControlCenterModal from '../components/ControlCenterModal';
import AgentContactList from '../components/AgentContactList';
import { Agent, BackendConversation, Message, Session, User } from '../types';
import { agentsApi, approvalsApi, authApi, authToken, connectSocket, conversationsApi, messagesApi, settingsApi } from '../services';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

function decorateAgent(agent: Agent): Agent {
  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : JSON.parse(agent.capabilities || '[]');
  return {
    ...agent,
    tags: capabilities,
    iconType: 'RobotOutlined',
    color: agent.adapterType === 'claude' ? '#8B5CF6' : '#10B981',
  };
}

function toSession(conversation: BackendConversation): Session {
  return {
    id: conversation.id,
    name: conversation.title || '新会话',
    agentIds: conversation.members.map(member => member.agent.id),
    type: conversation.type,
    isPinned: conversation.pinned,
    isArchived: conversation.archived,
    lastActiveAt: conversation.lastActiveAt,
    unreadCount: 0,
  };
}

function toMessage(raw: any, agents: Agent[]): Message {
  let metadata = raw.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  const agent = agents.find(item => item.id === (raw.agentId || raw.senderId));
  return {
    id: raw.id,
    sessionId: raw.conversationId,
    senderId: raw.senderId,
    senderName: raw.senderType === 'user' ? '我' : agent?.name || (raw.senderType === 'system' ? 'Orchestrator' : 'Agent'),
    content: raw.content,
    type: raw.senderType === 'user' ? 'user' : 'agent',
    createdAt: raw.createdAt,
    isPinned: raw.isPinned,
    quotedMessageId: raw.quotedMessageId,
    status: raw.status,
    metadata,
  };
}

const ChatPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [newSessionVisible, setNewSessionVisible] = useState(false);
  const [keysVisible, setKeysVisible] = useState(false);
  const [controlCenterVisible, setControlCenterVisible] = useState(false);
  const [agentsVisible, setAgentsVisible] = useState(false);
  const [replyQuote, setReplyQuote] = useState('');
  const [quotedMessageId, setQuotedMessageId] = useState<string | undefined>();
  const [processing, setProcessing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [taskVisible, setTaskVisible] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const agentsRef = useRef<Agent[]>([]);
  const sessionsRef = useRef<Session[]>([]);
  const selectedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    selectedSessionRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    if (!authToken.get()) return;
    authApi.me().then(setUser).catch(() => authToken.clear());
  }, []);

  useEffect(() => {
    const updateNetworkState = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([agentsApi.getAgents(), conversationsApi.list()])
      .then(([agentRows, conversationRows]) => {
        setAgents(agentRows.map(decorateAgent));
        setSessions(conversationRows.map(toSession));
      })
      .catch(error => toast.error(error.message));
    const socket = connectSocket();
    socketRef.current = socket;
    socket.on('message:created', (raw: any) => appendMessage(toMessage(raw, agentsRef.current)));
    socket.on('message:chunk', ({ conversationId, messageId, chunk }: { conversationId: string; messageId: string; chunk: string }) => {
      setMessages(previous => ({
        ...previous,
        [conversationId]: (previous[conversationId] || []).map(item =>
          item.id === messageId ? { ...item, content: item.content + chunk } : item
        ),
      }));
    });
    socket.on('message:completed', (raw: any) => {
      upsertMessage(toMessage(raw, agentsRef.current));
      if (sessionsRef.current.find(item => item.id === raw.conversationId)?.type !== 'group') setProcessing(false);
    });
    socket.on('orchestration:state', (state: { status: string }) => setProcessing(state.status === 'running'));
    socket.on('task:state', () => {
      if (selectedSessionRef.current) conversationsApi.orchestrations(selectedSessionRef.current).then(setRuns).catch(() => undefined);
    });
    socket.on('tool:approval-created', () => toast.info('A tool action is awaiting approval.'));
    socket.on('deployment:state', (state: { status: string }) => {
      toast.info(`Deployment state: ${state.status}`);
      window.agentHubDesktop?.notifyDeployment(`Deployment state: ${state.status}`);
    });
    socket.on('error', (error: { message?: string }) => {
      setProcessing(false);
      toast.error(error.message || '实时通信失败');
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const appendMessage = (item: Message) => setMessages(previous => ({
    ...previous,
    [item.sessionId]: [...(previous[item.sessionId] || []).filter(existing => existing.id !== item.id), item],
  }));
  const upsertMessage = (item: Message) => setMessages(previous => ({
    ...previous,
    [item.sessionId]: (previous[item.sessionId] || []).some(existing => existing.id === item.id)
      ? (previous[item.sessionId] || []).map(existing => existing.id === item.id ? item : existing)
      : [...(previous[item.sessionId] || []), item],
  }));

  const selectSession = async (session: Session) => {
    setSelectedSessionId(session.id);
    setReplyQuote('');
    setQuotedMessageId(undefined);
    if (!openSessionIds.includes(session.id)) setOpenSessionIds(previous => [...previous, session.id]);
    socketRef.current?.emit('conversation:join', session.id);
    if (!messages[session.id]) {
      try {
        const result = await messagesApi.getMessages(session.id);
        setMessages(previous => ({ ...previous, [session.id]: result.map(row => toMessage(row, agents)) }));
      } catch (error: any) {
        toast.error(error.message);
      }
    }
    if (session.type === 'group') {
      conversationsApi.orchestrations(session.id).then(setRuns).catch(() => setRuns([]));
    } else {
      setRuns([]);
    }
  };

  const createSession = async (type: 'single' | 'group') => {
    const selected = agents.filter(agent => selectedAgentIds.includes(agent.id));
    try {
      const title = type === 'single' ? `${selected[0].name} 对话` : `${selected.map(agent => agent.name).join(' & ')} 协作`;
      const row = await conversationsApi.create(title, type, selectedAgentIds);
      const session = toSession(row);
      setSessions(previous => [session, ...previous]);
      setNewSessionVisible(false);
      setSelectedAgentIds([]);
      await selectSession(session);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const sendMessage = (content: string) => {
    if (!selectedSessionId) return;
    const mentionedAgentIds = agents.filter(agent => content.includes(`@${agent.name}`)).map(agent => agent.id);
    setProcessing(true);
    socketRef.current?.emit('message:send', {
      conversationId: selectedSessionId,
      content,
      mentionedAgentIds,
      quotedMessageId,
    });
    setReplyQuote('');
    setQuotedMessageId(undefined);
  };

  const currentMessages = selectedSessionId ? messages[selectedSessionId] || [] : [];
  const tabs = openSessionIds.map(id => {
    const session = sessions.find(item => item.id === id);
    return {
      key: id,
      label: (
        <Space>
          <Avatar size={22} icon={<RobotOutlined />} />
          {session?.name || '会话'}
          <CloseOutlined onClick={event => {
            event.stopPropagation();
            setOpenSessionIds(previous => previous.filter(item => item !== id));
            if (selectedSessionId === id) setSelectedSessionId(null);
          }} />
        </Space>
      ),
    };
  });

  if (!user) {
    return (
      <Layout style={{ height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <Card title="AgentHub" style={{ width: 380 }}>
          <Form layout="vertical" onFinish={async values => {
            try {
              const result = authMode === 'login'
                ? await authApi.login(values.email, values.password)
                : await authApi.register(values.name, values.email, values.password);
              authToken.set(result.token);
              setUser(result.user);
            } catch (error: any) {
              toast.error(error.message);
            }
          }}>
            {authMode === 'register' && <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>}
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
            <Button type="primary" htmlType="submit" block>{authMode === 'login' ? '登录' : '注册'}</Button>
            <Button type="link" block onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
              {authMode === 'login' ? '创建新账户' : '已有账户，登录'}
            </Button>
          </Form>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider className="agenthub-sidebar" width={320} theme="light">
        <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text strong>{user.name}</Text>
            <Space>
              <Button icon={<AppstoreOutlined />} onClick={() => setControlCenterVisible(true)} />
              <Button icon={<ContactsOutlined />} onClick={() => setAgentsVisible(true)} />
              <Button icon={<KeyOutlined />} onClick={() => setKeysVisible(true)} />
              <Button icon={<LogoutOutlined />} onClick={() => { authToken.clear(); setUser(null); }} />
            </Space>
          </Space>
        </div>
        <SessionList
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={selectSession}
          onPinSession={async id => {
            const session = sessions.find(item => item.id === id)!;
            await conversationsApi.update(id, { pinned: !session.isPinned });
            setSessions(previous => previous.map(item => item.id === id ? { ...item, isPinned: !item.isPinned } : item));
          }}
          onArchiveSession={async id => {
            await conversationsApi.update(id, { archived: true });
            setSessions(previous => previous.map(item => item.id === id ? { ...item, isArchived: true } : item));
          }}
          onUnarchiveSession={async id => {
            await conversationsApi.update(id, { archived: false });
            setSessions(previous => previous.map(item => item.id === id ? { ...item, isArchived: false } : item));
          }}
          onOpenNewSession={() => setNewSessionVisible(true)}
        />
      </Sider>
      <Layout>
        {!online && <Alert type="warning" showIcon message="Offline. Approvals and deployments require a connection." />}
        <Tabs activeKey={selectedSessionId || undefined} onChange={id => selectSession(sessions.find(item => item.id === id)!)} items={tabs} type="card" />
        <Content style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selectedSessionId ? (
            <>
              {sessions.find(item => item.id === selectedSessionId)?.type === 'group' && <Button style={{ margin: '0 24px 8px', alignSelf: 'flex-start' }} onClick={async () => {
                setRuns(await conversationsApi.orchestrations(selectedSessionId));
                setTaskVisible(true);
              }}>Task status</Button>}
              <MessageFlow
                messages={currentMessages}
                onReply={item => {
                  setReplyQuote(`> ${item.senderName}: ${item.content.split('\n')[0]}\n\n`);
                  setQuotedMessageId(item.id);
                }}
                onTogglePinMessage={async id => {
                  const updated = await messagesApi.togglePinMessage(id);
                  upsertMessage(toMessage(updated, agents));
                }}
                onRegenerate={item => {
                  if (!selectedSessionId) return;
                  setProcessing(true);
                  socketRef.current?.emit('message:regenerate', { conversationId: selectedSessionId, messageId: item.id });
                }}
                onApplyDiff={async data => {
                  if (!data.approvalId) return toast.error('This diff has no approval request.');
                  await approvalsApi.resolve(data.approvalId, 'approve');
                  toast.success('Diff approved and applied.');
                }}
                onSelectCodeForModify={selectedCode => setReplyQuote(`Please modify the selected code below:\n\n\`\`\`\n${selectedCode}\n\`\`\`\n\nRequested change: `)}
              />
              {processing && <Button danger style={{ margin: '0 24px 8px', alignSelf: 'flex-end' }} onClick={() => {
                socketRef.current?.emit('orchestration:cancel', { conversationId: selectedSessionId });
                setProcessing(false);
              }}>Cancel generation</Button>}
              <MessageInput onSendMessage={sendMessage} disabled={processing} agents={agents} initialContent={replyQuote} />
            </>
          ) : <div style={{ margin: 'auto' }}><Title level={4} type="secondary">请选择或创建会话</Title></div>}
        </Content>
      </Layout>
      <NewSessionModal visible={newSessionVisible} agents={agents} selectedAgentIds={selectedAgentIds} onSelectAgents={setSelectedAgentIds} onCreateSession={createSession} onCancel={() => setNewSessionVisible(false)} />
      <ControlCenterModal open={controlCenterVisible} onClose={() => setControlCenterVisible(false)} currentConversationId={selectedSessionId} />
      <Modal title="Agent 联系人" open={agentsVisible} footer={null} width={560} onCancel={async () => {
        setAgentsVisible(false);
        const refreshed = await agentsApi.getAgents();
        setAgents(refreshed.map(decorateAgent));
      }}>
        <div style={{ height: 560 }}><AgentContactList /></div>
      </Modal>
      <Modal title="模型 API Key" open={keysVisible} footer={null} onCancel={() => setKeysVisible(false)}>
        <Form layout="vertical" onFinish={async values => {
          try {
            if (values.openai) await settingsApi.saveProvider('openai', { apiKey: values.openai });
            if (values.anthropic) await settingsApi.saveProvider('anthropic', { apiKey: values.anthropic });
            if (values.mimo) await settingsApi.saveProvider('mimo', { apiKey: values.mimo, baseURL: values.mimoBaseURL, defaultModel: values.mimoModel });
            toast.success('密钥已加密保存');
            setKeysVisible(false);
          } catch (error: any) { toast.error(error.message); }
        }}>
          <Form.Item name="openai" label="OpenAI API Key"><Input.Password /></Form.Item>
          <Form.Item name="anthropic" label="Anthropic API Key"><Input.Password /></Form.Item>
          <Form.Item name="mimo" label="MiMo API Key"><Input.Password /></Form.Item>
          <Form.Item name="mimoBaseURL" label="MiMo Base URL" initialValue="https://token-plan-cn.xiaomimimo.com/v1"><Input /></Form.Item>
          <Form.Item name="mimoModel" label="MiMo Model" initialValue="mimo-v2.5-pro"><Input /></Form.Item>
          <Button htmlType="submit" type="primary">保存</Button>
        </Form>
      </Modal>
      <Drawer title="Orchestration tasks" open={taskVisible} onClose={() => setTaskVisible(false)} width={480}>
        <List dataSource={runs} renderItem={run => (
          <List.Item>
            <List.Item.Meta title={<Space><span>{run.request}</span><Tag>{run.status}</Tag></Space>} description={
              <List size="small" dataSource={run.tasks} renderItem={(task: any) => (
                <List.Item><Space><span>{task.title}</span><Tag color={task.status === 'completed' ? 'green' : task.status === 'failed' ? 'red' : 'blue'}>{task.status}</Tag></Space></List.Item>
              )} />
            } />
          </List.Item>
        )} />
      </Drawer>
    </Layout>
  );
};

export default ChatPage;
