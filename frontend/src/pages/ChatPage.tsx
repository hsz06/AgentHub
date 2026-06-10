import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Button, Card, Drawer, Form, Input, List, Modal, Space, Tabs, Tag, message as toast } from 'antd';
import { AppstoreOutlined, BellOutlined, CloseOutlined, CodeOutlined, ContactsOutlined, FileTextOutlined, KeyOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, SafetyCertificateOutlined, SearchOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Socket } from 'socket.io-client';
import SessionList from '../components/SessionList';
import MessageFlow from '../components/MessageFlow';
import MessageInput, { AttachmentDraft } from '../components/MessageInput';
import NewSessionModal from '../components/NewSessionModal';
import ControlCenterModal from '../components/ControlCenterModal';
import AgentContactList from '../components/AgentContactList';
import { Agent, BackendConversation, Message, Session, User } from '../types';
import { agentsApi, approvalsApi, artifactsApi, authApi, authToken, connectSocket, conversationsApi, messagesApi, settingsApi } from '../services';

const WorkspaceWorkbench = lazy(() => import('../components/WorkspaceWorkbench'));

export function classifyAdapter(adapter?: string | null): 'claude' | 'codex' | 'opencode' | 'orchestrator' | 'user' {
  const value = String(adapter || '').toLowerCase();
  if (value.includes('claude')) return 'claude';
  if (value.includes('codex')) return 'codex';
  if (value.includes('opencode')) return 'opencode';
  if (value.includes('orchestrator') || value.includes('mimo')) return 'orchestrator';
  return 'user';
}

const ADAPTER_RING: Record<string, string> = {
  claude: '#a16f3d',
  codex: '#4f7a3f',
  opencode: '#5e4476',
  orchestrator: '#2f6e74',
  user: '#2c2926',
};

function summarizeSearchHit(content: string, query: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!query.trim()) return normalized.slice(0, 180);
  const index = normalized.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index < 0) return normalized.slice(0, 180);
  const start = Math.max(0, index - 56);
  const end = Math.min(normalized.length, index + query.length + 96);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
}

function decorateAgent(agent: Agent): Agent {
  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : JSON.parse(agent.capabilities || '[]');
  const kind = classifyAdapter(agent.adapterType);
  return {
    ...agent,
    tags: capabilities,
    iconType: 'RobotOutlined',
    color: ADAPTER_RING[kind],
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAgentMentioned(content: string, agent: Agent) {
  return new RegExp(`@${escapeRegExp(agent.name)}(?=$|\\s|[,.!?;:，。！？；：、）)\\]}])`).test(content);
}

type DeploymentStateEvent = {
  deploymentId?: string;
  status: string;
  previewUrl?: string | null;
  errorMsg?: string;
};

function updateDeploymentCards(messages: Message[], state: DeploymentStateEvent): Message[] {
  if (!state.deploymentId) return messages;
  let changed = false;
  const next = messages.map(message => {
    const cards = message.metadata?.preview_cards;
    if (!cards?.length) return message;
    const nextCards = cards.map(card => {
      const data = card.data as Record<string, unknown>;
      if (card.type !== 'deployment-status' || data.deploymentId !== state.deploymentId) return card;
      changed = true;
      return {
        ...card,
        data: {
          ...data,
          status: normalizeDeploymentCardStatus(state.status),
          deployUrl: state.previewUrl || data.deployUrl,
          errorMsg: state.errorMsg || data.errorMsg,
        },
      };
    });
    return { ...message, metadata: { ...message.metadata, preview_cards: nextCards } };
  });
  return changed ? next : messages;
}

function normalizeDeploymentCardStatus(status: string) {
  if (status === 'pending_approval') return 'pending';
  if (status === 'queued' || status === 'starting') return 'deploying';
  if (status === 'stopped') return 'failed';
  return status;
}

async function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [workbenchVisible, setWorkbenchVisible] = useState(false);
  const [mobileWorkbenchVisible, setMobileWorkbenchVisible] = useState(false);
  const [mobileSessionsVisible, setMobileSessionsVisible] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [controlCenterTab, setControlCenterTab] = useState('workspaces');
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [runs, setRuns] = useState<any[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
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

  const refreshPendingApprovals = useCallback(async () => {
    const rows = await approvalsApi.list();
    setPendingApprovalsCount(rows.filter(item => item.status === 'pending').length);
  }, []);

  useEffect(() => {
    if (!authToken.get()) return;
    authApi.me().then(setUser).catch(() => authToken.clear());
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
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
    refreshPendingApprovals().catch(() => undefined);
    const socket = connectSocket();
    socketRef.current = socket;
    socket.on('conversation:updated', (raw: BackendConversation) => {
      const updated = toSession(raw);
      setSessions(previous => previous.some(item => item.id === updated.id)
        ? previous.map(item => item.id === updated.id ? updated : item)
        : [updated, ...previous]);
    });
    socket.on('agent:created', (raw: Agent) => {
      const created = decorateAgent(raw);
      setAgents(previous => previous.some(item => item.id === created.id)
        ? previous.map(item => item.id === created.id ? created : item)
        : [...previous, created]);
      toast.success(`已创建 Agent：${created.name}`);
    });
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
    socket.on('tool:approval-created', () => {
      toast.info('A tool action is awaiting approval.');
      refreshPendingApprovals().catch(() => undefined);
    });
    socket.on('tool:result', () => refreshPendingApprovals().catch(() => undefined));
    socket.on('deployment:state', (state: DeploymentStateEvent) => {
      setMessages(previous => Object.fromEntries(
        Object.entries(previous).map(([conversationId, rows]) => [conversationId, updateDeploymentCards(rows, state)])
      ));
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
  }, [user, refreshPendingApprovals]);

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
    setActiveMessageId(null);
    setMobileSessionsVisible(false);
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

  const sendMessage = (content: string, attachments: AttachmentDraft[] = []) => {
    if (!selectedSessionId) return;
    const mentionedAgentIds = agents.filter(agent => isAgentMentioned(content, agent)).map(agent => agent.id);
    setProcessing(true);
    socketRef.current?.emit('message:send', {
      conversationId: selectedSessionId,
      content,
      mentionedAgentIds,
      quotedMessageId,
      artifactContext: attachments,
    });
    setReplyQuote('');
    setQuotedMessageId(undefined);
  };

  const uploadAttachment = async (file: File): Promise<AttachmentDraft> => {
    const type = file.type.startsWith('image/') ? 'image' : 'attachment';
    const artifact = await artifactsApi.create({
      name: file.name,
      type,
      mimeType: file.type || 'application/octet-stream',
      encoding: 'base64',
      content: await toBase64(file),
    });
    return {
      artifactId: artifact.id,
      name: file.name,
      type,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      url: type === 'image' ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/artifacts/${artifact.id}/download` : undefined,
    };
  };

  const retryOrchestrationTask = async (runId: string, taskId: string) => {
    if (!selectedSessionId) return;
    try {
      await conversationsApi.retryOrchestrationTask(selectedSessionId, runId, taskId);
      setRuns(await conversationsApi.orchestrations(selectedSessionId));
      toast.success('任务已重新执行');
    } catch (error: any) {
      toast.error(error.message || '任务重试失败');
    }
  };

  const currentMessages = selectedSessionId ? messages[selectedSessionId] || [] : [];
  const currentSession = sessions.find(item => item.id === selectedSessionId);
  const currentAgents = agents.filter(agent => currentSession?.agentIds.includes(agent.id));
  const messageSearchResults = currentMessages
    .filter(item => {
      const query = messageSearchQuery.trim().toLowerCase();
      return query && [
        item.content,
        item.senderName,
        item.metadata?.preview_cards?.map(card => `${card.title} ${card.description || ''}`).join(' '),
      ].filter(Boolean).join(' ').toLowerCase().includes(query);
    })
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());
  const openControlCenter = (tab = 'workspaces') => {
    setControlCenterTab(tab);
    setControlCenterVisible(true);
    if (tab === 'approvals') refreshPendingApprovals().catch(() => undefined);
  };
  const openMessageSearch = async () => {
    if (!selectedSessionId) return;
    setSearchVisible(true);
    if (!messages[selectedSessionId]) {
      try {
        const result = await messagesApi.getMessages(selectedSessionId);
        setMessages(previous => ({ ...previous, [selectedSessionId]: result.map(row => toMessage(row, agents)) }));
      } catch (error: any) {
        toast.error(error.message);
      }
    }
  };
  const tabs = openSessionIds.map(id => {
    const session = sessions.find(item => item.id === id);
    return {
      key: id,
      label: (
        <Space size={6}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em', color: '#7a7468' }}>{id.slice(0, 6)}</span>
          <span>{session?.name || '会话'}</span>
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
      <div className="auth-shell">
        <div className="auth-stage">
          <div className="auth-stage-head">
            <div className="rail-brand">AH</div>
            <div>
              <strong>AgentHub</strong>
              <div style={{ marginTop: 4, fontFamily: 'JetBrains Mono', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6e6a5e' }}>OPERATIONS · v0.9</div>
            </div>
          </div>
          <div className="auth-stage-body">
            <span className="kicker">A MESSAGING LAYER FOR CODING AGENTS</span>
            <h1>把 Claude、Codex、OpenCode<br/><em>拉到一个群里</em>,统一协作。</h1>
            <p>像聊天软件一样发起任务,Agent 在受控工作区里生成代码、网页、文档与部署,所有写文件与命令执行都先经过你的审批。</p>
          </div>
          <div className="auth-stage-foot">
            <div>RUNTIME<strong>Claude · Codex · OpenCode</strong></div>
            <div>WORKSPACE<strong>Local snapshot · Diff approvals</strong></div>
            <div>ARTIFACTS<strong>Code · Web · Slides · Deploy</strong></div>
          </div>
        </div>
        <div className="auth-form-side">
          <Card className="auth-card" title={<><span className="kicker">OPERATOR ACCESS</span><strong>{authMode === 'login' ? '登录到工作空间' : '创建你的账户'}</strong></>}>
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
              {authMode === 'register' && <Form.Item name="name" label="昵称" rules={[{ required: true }]}><Input placeholder="你想被怎么称呼" /></Form.Item>}
              <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}><Input placeholder="you@team.com" /></Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, min: 8 }]}><Input.Password placeholder="至少 8 位" /></Form.Item>
              <Button type="primary" htmlType="submit" block>{authMode === 'login' ? '进入工作空间' : '创建账户'}</Button>
              <Button type="link" block onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                {authMode === 'login' ? '没有账户?注册一个' : '已有账户,登录'}
              </Button>
            </Form>
          </Card>
        </div>
      </div>
    );
  }

  const adapterCountByKind = currentAgents.reduce<Record<string, number>>((acc, agent) => {
    const kind = classifyAdapter(agent.adapterType);
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="agenthub-shell">
      <aside className="workspace-rail">
        <div className="rail-brand">AH</div>
        <div className="rail-divider" />
        <button className="rail-item is-active" title="工作空间">
          <MessageOutlined style={{ fontSize: 17 }} />
          {sessions.length > 0 && <span className="rail-item-badge">{sessions.length > 99 ? '99' : sessions.length}</span>}
        </button>
        <button className="rail-item" title="Agent 联系人" onClick={() => setAgentsVisible(true)}>
          <TeamOutlined style={{ fontSize: 17 }} />
        </button>
        <button className="rail-item" title="审批" onClick={() => openControlCenter('approvals')}>
          <SafetyCertificateOutlined style={{ fontSize: 17 }} />
          {pendingApprovalsCount > 0 && <span className="rail-item-badge">{pendingApprovalsCount > 99 ? '99+' : pendingApprovalsCount}</span>}
        </button>
        <button className="rail-item" title="产物" onClick={() => openControlCenter('artifacts')}>
          <FileTextOutlined style={{ fontSize: 17 }} />
        </button>
        <button className="rail-item" title="部署" onClick={() => openControlCenter('deployments')}>
          <AppstoreOutlined style={{ fontSize: 17 }} />
        </button>
        <div className="rail-spacer" />
        <button className="rail-item rail-item--bottom" title="API Key" onClick={() => setKeysVisible(true)}>
          <KeyOutlined style={{ fontSize: 16 }} />
        </button>
        <button className="rail-item rail-item--bottom" title="设置" onClick={() => openControlCenter('providers')}>
          <SettingOutlined style={{ fontSize: 16 }} />
        </button>
      </aside>

      <aside className={`channel-list ${mobileSessionsVisible ? 'is-mobile-visible' : ''}`}>
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
          onDeleteSession={async id => {
            await conversationsApi.remove(id);
            setSessions(previous => previous.filter(item => item.id !== id));
            setOpenSessionIds(previous => previous.filter(item => item !== id));
            setMessages(previous => {
              const next = { ...previous };
              delete next[id];
              return next;
            });
            if (selectedSessionId === id) {
              setSelectedSessionId(null);
              setRuns([]);
              setReplyQuote('');
              setQuotedMessageId(undefined);
            }
            toast.success('会话已删除');
          }}
          onOpenNewSession={() => setNewSessionVisible(true)}
          agents={agents}
        />
        <div className="channel-user">
          <div style={{ position: 'relative' }}>
            <Avatar className="av av--sm" style={{ background: '#2c2926', color: '#f4f0e6', borderRadius: 6 }}>{user.name[0]}</Avatar>
            <span className="av-presence av-presence--channel" />
          </div>
          <div className="channel-user-info">
            <strong>{user.name}</strong>
            <span className="status status--online">ACTIVE</span>
          </div>
          <Button type="text" icon={<BellOutlined />} title="通知" />
          <Button type="text" icon={<LogoutOutlined />} onClick={() => { authToken.clear(); setUser(null); }} title="退出" />
        </div>
      </aside>

      <main className="agenthub-main">
        {!online && <Alert className="network-alert" banner type="warning" showIcon message="OFFLINE — 审批与本机部署需要网络连接" />}
        <header className="thread-header">
          <div className="thread-header-main">
            <Button className="mobile-only action-btn action-btn--icon" type="text" icon={<MenuOutlined />} onClick={() => setMobileSessionsVisible(true)} />
            {currentSession ? (
              <>
                <div className={`thread-glyph ${currentSession.type === 'group' ? 'thread-glyph--group' : ''}`}>
                  {currentSession.type === 'group' ? '#' : '@'}
                </div>
                <div className="thread-title-block">
                  <div className="thread-title">
                    <strong>{currentSession.name}</strong>
                  </div>
                  <div className="thread-meta">
                    {currentAgents.length > 0 && (
                      <div className="av-stack av-stack--oncream">
                        {currentAgents.slice(0, 4).map(agent => {
                          const kind = classifyAdapter(agent.adapterType);
                          return <span key={agent.id} className={`av av--xs av--${kind}`}>{agent.name[0]?.toUpperCase()}</span>;
                        })}
                        {currentAgents.length > 4 && <span className="av-stack-more">+{currentAgents.length - 4}</span>}
                      </div>
                    )}
                    <span>{currentAgents.length} Agent</span>
                    <span className="thread-meta-divider" />
                    <span>{currentSession.type === 'group' ? '多 Agent 群聊' : '单 Agent 私聊'}</span>
                    {Object.entries(adapterCountByKind).length > 0 && <>
                      <span className="thread-meta-divider" />
                      <span className="run-id">
                        {Object.entries(adapterCountByKind).map(([k, n]) => `${k.toUpperCase()}·${n}`).join(' / ')}
                      </span>
                    </>}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="thread-glyph">~</div>
                <div className="thread-title-block">
                  <div className="thread-title"><strong>未选择会话</strong></div>
                  <div className="thread-meta">从左侧选择会话, 或新建一个</div>
                </div>
              </>
            )}
          </div>
          <div className="thread-actions">
            <Button className="action-btn action-btn--icon" type="text" icon={<SearchOutlined />} onClick={openMessageSearch} disabled={!selectedSessionId} title="搜索消息" />
            <Button className="action-btn action-btn--icon" type="text" icon={<ContactsOutlined />} onClick={() => setAgentsVisible(true)} title="Agent 联系人" />
            <Button className="action-btn" type="text" icon={<SafetyCertificateOutlined />} onClick={() => openControlCenter('approvals')}>
              审批
            </Button>
            <Button className="action-btn" type="text" icon={<CodeOutlined />} onClick={() => {
              if (mobile) {
                setMobileWorkbenchVisible(true);
              } else {
                setWorkbenchVisible(value => !value);
              }
            }}>
              工作台
            </Button>
            <Button className="action-btn action-btn--primary" icon={<AppstoreOutlined />} onClick={() => openControlCenter()}>
              控制中心
            </Button>
          </div>
        </header>
        {tabs.length > 0 && <Tabs className="thread-tabs" activeKey={selectedSessionId || undefined} onChange={id => selectSession(sessions.find(item => item.id === id)!)} items={tabs} />}
        <div className={`thread-canvas ${selectedSessionId && workbenchVisible && !mobile ? 'has-workbench' : ''}`}>
          <div className="thread-content-wrap">
            {selectedSessionId ? (
              <>
                {currentSession?.type === 'group' && <Button className="task-status-button" onClick={async () => {
                  setRuns(await conversationsApi.orchestrations(selectedSessionId));
                  setTaskVisible(true);
                }}>任务编排状态</Button>}
                <MessageFlow
                  messages={currentMessages}
                  agents={agents}
                  activeMessageId={activeMessageId}
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
                    refreshPendingApprovals().catch(() => undefined);
                    toast.success('Diff approved and applied.');
                  }}
                  onSelectCodeForModify={selectedCode => setReplyQuote(`Please modify the selected code below:\n\n\`\`\`\n${selectedCode}\n\`\`\`\n\nRequested change: `)}
                />
                {processing && <Button className="cancel-generation" onClick={() => {
                  socketRef.current?.emit('orchestration:cancel', { conversationId: selectedSessionId });
                  setProcessing(false);
                }}>取消生成</Button>}
                <MessageInput onSendMessage={sendMessage} onUploadAttachment={uploadAttachment} disabled={processing} agents={agents} currentAgentIds={currentSession?.agentIds || []} initialContent={replyQuote} />
              </>
            ) : (
              <div className="conversation-empty">
                <div className="conversation-empty-card">
                  <span className="kicker">START COLLABORATING</span>
                  <h3>选择会话<br/>或邀请一个 Agent 入群</h3>
                  <p>所有任务、文件改动与部署都会沉淀在会话里。绑定 workspace 之后, 右侧的工作台会显示 Agent 改动的文件, 等你审批。</p>
                  <div className="conversation-empty-tips">
                    <div className="tip"><kbd>⌘</kbd>+<kbd>K</kbd> 快速搜索会话</div>
                    <div className="tip"><kbd>@</kbd> 在消息里调用 Agent</div>
                    <div className="tip"><kbd>⇧</kbd>+<kbd>↵</kbd> 换行 · <kbd>↵</kbd> 发送</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {selectedSessionId && workbenchVisible && !mobile && (
            <aside className="desktop-workbench">
              <Suspense fallback={<div className="workbench-loading">LOADING WORKSPACE</div>}>
                <WorkspaceWorkbench
                  conversationId={selectedSessionId}
                  onOpenControlCenter={() => openControlCenter('workspaces')}
                  onApprovalsChanged={() => refreshPendingApprovals().catch(() => undefined)}
                />
              </Suspense>
            </aside>
          )}
        </div>
      </main>
      <nav className="mobile-bottom-nav">
        <button className={mobileSessionsVisible ? 'is-active' : ''} onClick={() => setMobileSessionsVisible(true)}><MenuOutlined /><span>会话</span></button>
        <button onClick={() => openControlCenter('approvals')}>
          <SafetyCertificateOutlined />
          <span>审批</span>
          {pendingApprovalsCount > 0 && <span className="mobile-nav-badge">{pendingApprovalsCount > 99 ? '99+' : pendingApprovalsCount}</span>}
        </button>
        <button onClick={() => openControlCenter('artifacts')}><FileTextOutlined /><span>产物</span></button>
        <button onClick={() => openControlCenter('deployments')}><AppstoreOutlined /><span>部署</span></button>
      </nav>
      <NewSessionModal visible={newSessionVisible} agents={agents} selectedAgentIds={selectedAgentIds} onSelectAgents={setSelectedAgentIds} onCreateSession={createSession} onCancel={() => setNewSessionVisible(false)} />
      <ControlCenterModal
        open={controlCenterVisible}
        onClose={() => setControlCenterVisible(false)}
        currentConversationId={selectedSessionId}
        initialTab={controlCenterTab}
        onApprovalsChanged={() => refreshPendingApprovals().catch(() => undefined)}
      />
      <Drawer className="mobile-workbench-drawer" title="文件预览" open={mobileWorkbenchVisible} placement="bottom" height="88vh" onClose={() => setMobileWorkbenchVisible(false)}>
        {mobileWorkbenchVisible && <Suspense fallback={<div className="workbench-loading">正在加载文件预览...</div>}>
          <WorkspaceWorkbench
            mobile
            conversationId={selectedSessionId}
            onOpenControlCenter={() => { setMobileWorkbenchVisible(false); openControlCenter('workspaces'); }}
            onApprovalsChanged={() => refreshPendingApprovals().catch(() => undefined)}
          />
        </Suspense>}
      </Drawer>
      <Drawer
        className="message-search-drawer"
        title={<><span className="drawer-kicker">THREAD SEARCH</span><strong>搜索当前会话</strong></>}
        open={searchVisible}
        width={420}
        onClose={() => setSearchVisible(false)}
      >
        <div className="message-search">
          <Input
            autoFocus
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索消息、发送者或产物标题"
            value={messageSearchQuery}
            onChange={event => setMessageSearchQuery(event.target.value)}
          />
          <div className="message-search-meta">
            {messageSearchQuery.trim() ? `${messageSearchResults.length} 条结果` : '输入关键词后搜索当前会话历史'}
          </div>
          <div className="message-search-results">
            {messageSearchResults.map(item => (
              <button
                key={item.id}
                className={`message-search-result${activeMessageId === item.id ? ' is-active' : ''}`}
                onClick={() => {
                  setActiveMessageId(item.id);
                  setSearchVisible(false);
                }}
              >
                <span className="message-search-result-head">
                  <strong>{item.senderName}</strong>
                  <em>{dayjs(item.createdAt).format('MM/DD HH:mm')}</em>
                </span>
                <span className="message-search-result-body">
                  {summarizeSearchHit(item.content, messageSearchQuery)}
                </span>
              </button>
            ))}
            {messageSearchQuery.trim() && messageSearchResults.length === 0 && (
              <div className="message-search-empty">
                <span className="kicker">NO MATCH</span>
                当前会话没有匹配消息
              </div>
            )}
          </div>
        </div>
      </Drawer>
      <Drawer className="agent-config-drawer" title={<><span className="drawer-kicker">AGENT DIRECTORY</span><strong>Agent 配置</strong></>} open={agentsVisible} width={980} onClose={async () => {
        setAgentsVisible(false);
        const refreshed = await agentsApi.getAgents();
        setAgents(refreshed.map(decorateAgent));
      }}>
        <AgentContactList onChanged={rows => setAgents(rows.map(decorateAgent))} />
      </Drawer>
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
                <List.Item
                  actions={['failed', 'cancelled'].includes(task.status)
                    ? [<Button size="small" onClick={() => retryOrchestrationTask(run.id, task.id)}>重试</Button>]
                    : undefined}
                >
                  <List.Item.Meta
                    title={<Space><span>{task.title}</span><Tag color={task.status === 'completed' ? 'green' : task.status === 'failed' ? 'red' : 'blue'}>{task.status}</Tag></Space>}
                    description={task.output && task.status === 'failed' ? task.output : undefined}
                  />
                </List.Item>
              )} />
            } />
          </List.Item>
        )} />
      </Drawer>
    </div>
  );
};

export default ChatPage;
