import { Avatar, List, Badge, Button, Space, Popover, Empty, Input, Collapse } from 'antd';
import { PushpinOutlined, PushpinFilled, FolderOutlined, PlusOutlined, SearchOutlined, InboxOutlined, UnlockOutlined } from '@ant-design/icons';
import { Session } from '../types';
import dayjs from 'dayjs';
import { useState, useMemo } from 'react';

const { Panel } = Collapse;

interface SessionListProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onPinSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onOpenNewSession: () => void;
}

const SessionList: React.FC<SessionListProps> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  onPinSession,
  onArchiveSession,
  onUnarchiveSession,
  onOpenNewSession,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeCollapseKeys, setActiveCollapseKeys] = useState<string[]>([]);

  const { activeSessions, archivedSessions } = useMemo(() => {
    let allSessions = [...sessions];

    let active = allSessions.filter(s => !s.isArchived);
    let archived = allSessions.filter(s => s.isArchived);

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      active = active.filter(s =>
        s.name.toLowerCase().includes(kw) ||
        (s.lastMessage && s.lastMessage.toLowerCase().includes(kw))
      );
      archived = archived.filter(s =>
        s.name.toLowerCase().includes(kw) ||
        (s.lastMessage && s.lastMessage.toLowerCase().includes(kw))
      );
    }

    const sortFn = (a: Session, b: Session) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return dayjs(b.lastActiveAt).valueOf() - dayjs(a.lastActiveAt).valueOf();
    };

    active.sort(sortFn);
    archived.sort(sortFn);

    return { activeSessions: active, archivedSessions: archived };
  }, [sessions, searchKeyword]);

  const getTimeDisplay = (time: string) => {
    const d = dayjs(time);
    const now = dayjs();
    if (d.isSame(now, 'day')) {
      return d.format('HH:mm');
    }
    if (d.isSame(now.subtract(1, 'day'), 'day')) {
      return '昨天';
    }
    if (d.isAfter(now.subtract(7, 'day'))) {
      return d.format('ddd');
    }
    return d.format('MM/DD');
  };

  const renderSessionItem = (session: Session, isArchivedView: boolean) => (
    <List.Item
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        backgroundColor: selectedSessionId === session.id ? '#e6f4ff' : 'transparent',
        transition: 'background-color 0.2s',
      }}
      onClick={() => onSelectSession(session)}
      actions={[
        isArchivedView ? (
          <Button
            key="unarchive"
            type="text"
            size="small"
            icon={<UnlockOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onUnarchiveSession(session.id);
            }}
          >
            恢复
          </Button>
        ) : (
          <Popover
            key="actions"
            content={
              <Space direction="vertical" size="small">
                <Button
                  type="text"
                  size="small"
                  icon={session.isPinned ? <PushpinFilled /> : <PushpinOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPinSession(session.id);
                  }}
                >
                  {session.isPinned ? '取消置顶' : '置顶'}
                </Button>
                <Button
                  type="text"
                  size="small"
                  icon={<FolderOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchiveSession(session.id);
                  }}
                >
                  归档
                </Button>
              </Space>
            }
            trigger="click"
            placement="rightTop"
          >
            <Button type="text" size="small" onClick={(e) => e.stopPropagation()}>
              ...
            </Button>
          </Popover>
        ),
      ]}
    >
      <List.Item.Meta
        avatar={
          <Badge count={session.unreadCount} size="small">
            <Avatar src={session.avatar} style={{ backgroundColor: '#1890ff' }}>
              {session.name[0]}
            </Avatar>
          </Badge>
        }
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>
              {session.isPinned && !isArchivedView && <PushpinFilled style={{ fontSize: 12, color: '#faad14', marginRight: 4 }} />}
              {session.name}
            </span>
            <span style={{ fontSize: 12, color: '#999' }}>{getTimeDisplay(session.lastActiveAt)}</span>
          </div>
        }
        description={
          <div
            style={{
              fontSize: 13,
              color: '#666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {session.lastMessage || '暂无消息'}
          </div>
        }
      />
    </List.Item>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f5' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>会话</h3>
          <Button type="primary" icon={<PlusOutlined />} onClick={onOpenNewSession}>
            新建会话
          </Button>
        </Space>
        <Input.Search
          placeholder="搜索会话..."
          prefix={<SearchOutlined style={{ color: '#999' }} />}
          allowClear
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          style={{ borderRadius: 8 }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeSessions.length === 0 && archivedSessions.length === 0 && !searchKeyword.trim() ? (
          <Empty description="暂无会话" style={{ marginTop: 60 }} />
        ) : (
          <>
            <List
              dataSource={activeSessions}
              renderItem={(session) => renderSessionItem(session, false)}
            />
            {archivedSessions.length > 0 && (
              <Collapse
                activeKey={activeCollapseKeys}
                onChange={(keys) => setActiveCollapseKeys(keys as string[])}
                style={{ backgroundColor: 'transparent', border: 'none', marginTop: 8 }}
              >
                <Panel
                  header={
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#666' }}>
                      <InboxOutlined style={{ marginRight: 6 }} />
                      已归档 ({archivedSessions.length})
                    </span>
                  }
                  key="archived"
                  style={{ border: 'none', backgroundColor: 'transparent' }}
                >
                  <List
                    dataSource={archivedSessions}
                    renderItem={(session) => renderSessionItem(session, true)}
                    style={{ backgroundColor: 'transparent' }}
                  />
                </Panel>
              </Collapse>
            )}
            {searchKeyword.trim() && activeSessions.length === 0 && archivedSessions.length === 0 && (
              <Empty description="未找到匹配的会话" style={{ marginTop: 60 }} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SessionList;
