import { Button, Empty, Popconfirm, Popover, Space } from 'antd';
import { DeleteOutlined, PushpinOutlined, PushpinFilled, FolderOutlined, PlusOutlined, SearchOutlined, UnlockOutlined } from '@ant-design/icons';
import { Agent, Session } from '../types';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

interface SessionListProps {
  sessions: Session[];
  agents?: Agent[];
  selectedSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onPinSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenNewSession: () => void;
}

function classifyAdapter(adapter?: string | null): 'claude' | 'codex' | 'opencode' | 'orchestrator' | 'user' {
  const v = String(adapter || '').toLowerCase();
  if (v.includes('claude')) return 'claude';
  if (v.includes('codex')) return 'codex';
  if (v.includes('opencode')) return 'opencode';
  if (v.includes('mimo') || v.includes('orchestrator')) return 'orchestrator';
  return 'user';
}

const SessionList: React.FC<SessionListProps> = ({
  sessions,
  agents = [],
  selectedSessionId,
  onSelectSession,
  onPinSession,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  onOpenNewSession,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ archived: true });

  const agentMap = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);

  const { pinned, directs, groups, archived } = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const matches = (s: Session) =>
      !kw ||
      s.name.toLowerCase().includes(kw) ||
      (s.lastMessage && s.lastMessage.toLowerCase().includes(kw));

    const live = sessions.filter(s => !s.isArchived && matches(s));
    const arch = sessions.filter(s => s.isArchived && matches(s));
    const byRecency = (a: Session, b: Session) => dayjs(b.lastActiveAt).valueOf() - dayjs(a.lastActiveAt).valueOf();

    return {
      pinned: live.filter(s => s.isPinned).sort(byRecency),
      directs: live.filter(s => !s.isPinned && s.type !== 'group').sort(byRecency),
      groups: live.filter(s => !s.isPinned && s.type === 'group').sort(byRecency),
      archived: arch.sort(byRecency),
    };
  }, [sessions, searchKeyword]);

  const fmtTime = (time: string) => {
    const d = dayjs(time);
    const now = dayjs();
    if (d.isSame(now, 'day')) return d.format('HH:mm');
    if (d.isSame(now.subtract(1, 'day'), 'day')) return '昨天';
    if (d.isAfter(now.subtract(7, 'day'))) return d.format('ddd');
    return d.format('MM/DD');
  };

  const renderRow = (session: Session, isArchivedView: boolean) => {
    const isActive = selectedSessionId === session.id;
    const isGroup = session.type === 'group';
    const sessionAgents = session.agentIds.map(id => agentMap.get(id)).filter(Boolean) as Agent[];
    const unread = session.unreadCount || 0;
    const glyph = session.isPinned && !isArchivedView ? '★' : isGroup ? '#' : '@';

    return (
      <div
        key={session.id}
        className={`channel-row${isActive ? ' is-active' : ''}${unread > 0 ? ' has-unread' : ''}`}
        onClick={() => onSelectSession(session)}
      >
        {isGroup && sessionAgents.length > 0 ? (
          <div className="av-stack" style={{ width: 24, height: 22 }}>
            {sessionAgents.slice(0, 2).map(a => {
              const k = classifyAdapter(a.adapterType);
              return <span key={a.id} className={`av av--xs av--${k}`} style={{ width: 18, height: 18, fontSize: 9 }}>{a.name[0]?.toUpperCase()}</span>;
            })}
          </div>
        ) : sessionAgents[0] ? (
          <span className={`av av--xs av--${classifyAdapter(sessionAgents[0].adapterType)}`} style={{ width: 18, height: 18, fontSize: 9 }}>
            {sessionAgents[0].name[0]?.toUpperCase()}
          </span>
        ) : (
          <span className="row-glyph">{glyph}</span>
        )}

        <div className="row-name-line">
          <span className="row-name">{session.name}</span>
          {session.isPinned && !isArchivedView && <span className="row-pin">●</span>}
        </div>

        <div className="row-trail">
          <span className="row-stamp">{fmtTime(session.lastActiveAt)}</span>
          {unread > 0 && <span className="row-unread">{unread > 99 ? '99+' : unread}</span>}
          <div className="row-actions">
            {isArchivedView ? (
              <Space size={2}>
                <Button
                  type="text"
                  size="small"
                  icon={<UnlockOutlined />}
                  onClick={e => { e.stopPropagation(); onUnarchiveSession(session.id); }}
                />
                <Popconfirm
                  title="删除这个会话？"
                  description="会话消息会被永久删除。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={e => { e?.stopPropagation(); onDeleteSession(session.id); }}
                >
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
                </Popconfirm>
              </Space>
            ) : (
              <Popover
                content={
                  <Space direction="vertical" size={4}>
                    <Button type="text" size="small" icon={session.isPinned ? <PushpinFilled /> : <PushpinOutlined />}
                      onClick={e => { e.stopPropagation(); onPinSession(session.id); }}>
                      {session.isPinned ? '取消置顶' : '置顶'}
                    </Button>
                    <Button type="text" size="small" icon={<FolderOutlined />}
                      onClick={e => { e.stopPropagation(); onArchiveSession(session.id); }}>
                      归档
                    </Button>
                    <Popconfirm
                      title="删除这个会话？"
                      description="会话消息会被永久删除。"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={e => { e?.stopPropagation(); onDeleteSession(session.id); }}
                    >
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={e => e.stopPropagation()}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                }
                trigger="click"
                placement="rightTop"
              >
                <Button type="text" size="small" onClick={e => e.stopPropagation()}>···</Button>
              </Popover>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (key: string, label: string, list: Session[], isArchivedView = false) => {
    if (list.length === 0) return null;
    const isCollapsed = !!collapsed[key];
    return (
      <div className={`channel-section${isCollapsed ? ' is-collapsed' : ''}`}>
        <div
          className="channel-section-head"
          onClick={() => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))}
        >
          <span className="toggle">{label}</span>
          <span className="count">{list.length}</span>
        </div>
        {!isCollapsed && list.map(s => renderRow(s, isArchivedView))}
      </div>
    );
  };

  const empty = pinned.length + directs.length + groups.length + archived.length === 0;

  return (
    <div className="session-list" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="channel-head">
        <div className="channel-head-top">
          <div>
            <h2>消息</h2>
            <span className="workspace-name">LOCAL WORKSPACE</span>
          </div>
          <Button className="channel-new-btn" icon={<PlusOutlined />} onClick={onOpenNewSession} title="新建会话" />
        </div>
        <div className="channel-search">
          <SearchOutlined />
          <input
            placeholder="搜索会话, 关键词或 @Agent"
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
          />
          <span className="channel-search-kbd">⌘K</span>
        </div>
      </div>
      <div className="channel-scroll">
        {empty ? (
          <div className="channel-empty">
            {searchKeyword.trim() ? (
              <>
                <span className="kicker">NO MATCH</span>
                没有匹配到任何会话
              </>
            ) : (
              <>
                <span className="kicker">EMPTY</span>
                还没有会话, 点击右上角 + 开始
                <div style={{ marginTop: 14 }}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="" />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {renderSection('pinned', '已置顶', pinned)}
            {renderSection('directs', '私聊 Agent', directs)}
            {renderSection('groups', '多 Agent 群聊', groups)}
            {renderSection('archived', '已归档', archived, true)}
          </>
        )}
      </div>
    </div>
  );
};

export default SessionList;
