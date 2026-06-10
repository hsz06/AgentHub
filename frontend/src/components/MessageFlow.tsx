import { useRef, useEffect, useState, useMemo } from 'react';
import { Button, Dropdown, message } from 'antd';
import {
  MoreOutlined,
  CommentOutlined,
  ReloadOutlined,
  CopyOutlined,
  CheckOutlined,
  CodeSandboxOutlined,
  ExpandOutlined,
  StarFilled,
  StarOutlined,
  EditOutlined,
  SmileOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Agent, Message, PreviewCardData, PreviewCardType } from '../types';
import dayjs from 'dayjs';
import PreviewCard from './PreviewCard';
import SandboxIframeWebPreview from './SandboxIframeWebPreview';
import CodeDiffCard from './CodeDiffCard';
import ImagePreviewCard from './ImagePreviewCard';
import FileAttachmentCard from './FileAttachmentCard';
import DeploymentStatusCard from './DeploymentStatusCard';
import FullPreviewModal from './FullPreviewModal';
import CodeEditorModal from './CodeEditorModal';
import { WebPreviewData, CodeDiffData } from '../types';
import { artifactsApi, deploymentsApi } from '../services';

const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:3001/api').origin;

function resolvePreviewUrl(url?: string) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${apiOrigin}${url.startsWith('/') ? url : `/${url}`}`;
}

interface MessageFlowProps {
  messages: Message[];
  agents?: Agent[];
  activeMessageId?: string | null;
  onReply?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onApplyDiff?: (diffData: any) => void;
  onTogglePinMessage?: (msgId: string) => void;
  onSetLongContext?: () => void;
  onSelectCodeForModify?: (selectedCode: string) => void;
}

interface FullPreviewState {
  visible: boolean;
  title: string;
  type: PreviewCardType;
  data: WebPreviewData | CodeDiffData;
}

interface CodeEditorState {
  visible: boolean;
  title: string;
  fileName: string;
  code: string;
  language: string;
}

function classifySender(msg: Message, agentMap?: Map<string, Agent>): 'user' | 'claude' | 'codex' | 'opencode' | 'orchestrator' | 'agent' {
  if (msg.type === 'user') return 'user';
  const agent = agentMap?.get(msg.senderId);
  const raw = String(agent?.adapterType || msg.senderName || '').toLowerCase();
  if (raw.includes('claude')) return 'claude';
  if (raw.includes('codex')) return 'codex';
  if (raw.includes('opencode')) return 'opencode';
  if (raw.includes('orchestrator') || raw.includes('mimo')) return 'orchestrator';
  return 'agent';
}

function providerLabel(kind: string): string {
  if (kind === 'claude') return 'Claude Code';
  if (kind === 'codex') return 'Codex';
  if (kind === 'opencode') return 'OpenCode';
  if (kind === 'orchestrator') return 'Orchestrator';
  if (kind === 'user') return 'You';
  return 'Agent';
}

const ResolvedWebPreview: React.FC<{ data: WebPreviewData }> = ({ data }) => {
  const [html, setHtml] = useState(data.htmlContent);
  useEffect(() => {
    if (!html && data.artifactId && data.versionId) {
      artifactsApi.version(data.artifactId, data.versionId).then(version => setHtml(version.content)).catch(() => setHtml('Preview unavailable.'));
    }
  }, [data.artifactId, data.versionId, html]);
  return <SandboxIframeWebPreview url={data.url} htmlContent={html} height={280} />;
};

const ResolvedImagePreview: React.FC<{ data: any; title: string; onFullScreen: () => void }> = ({ data, title, onFullScreen }) => {
  const [imageUrl, setImageUrl] = useState(data.imageUrl);
  useEffect(() => {
    if (!data.artifactId) return;
    let objectUrl = '';
    artifactsApi.download(data.artifactId).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    }).catch(() => undefined);
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [data.artifactId]);
  return <ImagePreviewCard imageUrl={imageUrl} title={title} onFullScreen={onFullScreen} />;
};

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderTextWithMentions(text: string, agents: Agent[]) {
  if (!agents.length) return text;
  const names = agents.map(a => a.name).filter(Boolean);
  if (!names.length) return text;
  const pattern = new RegExp(`@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<span key={`m-${key++}`} className="mention-chip">@{match[1]}</span>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

const MessageFlow: React.FC<MessageFlowProps> = ({
  messages,
  agents = [],
  activeMessageId,
  onReply,
  onRegenerate,
  onApplyDiff,
  onTogglePinMessage,
  onSelectCodeForModify,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const [fullPreviewState, setFullPreviewState] = useState<FullPreviewState>({
    visible: false,
    title: '',
    type: 'web-preview',
    data: {},
  });
  const [codeEditorState, setCodeEditorState] = useState<CodeEditorState>({
    visible: false,
    title: '',
    fileName: 'untitled.ts',
    code: '',
    language: 'typescript',
  });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const agentMap = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!activeMessageId) return;
    messageRefs.current[activeMessageId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMessageId]);

  const pinnedMessages = messages.filter(m => m.isPinned === true);
  const normalMessages = messages.filter(m => m.isPinned !== true);
  const messagesById = new Map(messages.map(item => [item.id, item]));

  // Annotate each message with whether it should collapse into a previous head (same sender within 5 min)
  const decorated = useMemo(() => {
    return normalMessages.map((msg, idx) => {
      const prev = normalMessages[idx - 1];
      const sameSender = prev && prev.senderId === msg.senderId && prev.type === msg.type;
      const closeInTime = prev && dayjs(msg.createdAt).diff(prev.createdAt, 'minute') < 5;
      const continued = Boolean(sameSender && closeInTime && !msg.quotedMessageId);
      const dayMark = !prev || !dayjs(prev.createdAt).isSame(msg.createdAt, 'day');
      return { msg, continued, dayMark };
    });
  }, [normalMessages]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      message.success('已复制');
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const handleOpenCodeEditor = (title: string, fileName: string, code: string, language: string) => {
    setCodeEditorState({ visible: true, title, fileName, code, language });
  };

  const renderPreviewCard = (cardData: PreviewCardData, index: number) => {
    const handleOpenFullScreen = () => {
      setFullPreviewState({ visible: true, title: cardData.title, type: cardData.type, data: cardData.data });
    };

    if (cardData.type === 'web-preview') {
      const data = cardData.data as WebPreviewData;
      return (
        <PreviewCard
          key={`preview-card-${index}`}
          title={cardData.title}
          description={cardData.description}
          kicker="WEB · ARTIFACT"
          onFullScreen={handleOpenFullScreen}
        >
          <ResolvedWebPreview data={data} />
        </PreviewCard>
      );
    }
    if (cardData.type === 'code-diff') {
      const data = cardData.data as CodeDiffData;
      return (
        <div key={`preview-card-${index}`} style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 6 }}>
            <Button size="small" type="primary" icon={<CodeSandboxOutlined />} onClick={() => onApplyDiff?.(data)}>应用 diff</Button>
            <Button size="small" icon={<ExpandOutlined />} onClick={handleOpenFullScreen}>展开</Button>
          </div>
          <CodeDiffCard
            oldCode={data.oldCode}
            newCode={data.newCode}
            language={data.language}
            fileName={data.fileName}
            onFullScreen={handleOpenFullScreen}
          />
        </div>
      );
    }
    if (cardData.type === 'image') {
      const data = cardData.data as any;
      return (
        <ResolvedImagePreview
          key={`preview-card-${index}`}
          data={data}
          title={cardData.title}
          onFullScreen={handleOpenFullScreen}
        />
      );
    }
    if (cardData.type === 'file-attachment') {
      const data = cardData.data as any;
      return (
        <FileAttachmentCard
          key={`preview-card-${index}`}
          fileName={data.fileName}
          fileSize={data.fileSize}
          fileType={data.fileType}
          onDownload={async () => {
            if (data.artifactId) downloadBlob(await artifactsApi.download(data.artifactId), data.fileName);
          }}
        />
      );
    }
    if (cardData.type === 'slides') {
      const data = cardData.data as any;
      return (
        <PreviewCard key={`preview-card-${index}`} kicker="SLIDES · ARTIFACT" title={cardData.title} description="可编辑的演示文稿">
          <div style={{ display: 'inline-flex', gap: 8 }}>
            <Button onClick={async () => data.artifactId && downloadBlob(await artifactsApi.exportPptx(data.artifactId), `${cardData.title}.pptx`)}>导出 PPTX</Button>
            <Button onClick={async () => data.artifactId && downloadBlob(await artifactsApi.download(data.artifactId), `${cardData.title}.json`)}>下载源</Button>
          </div>
        </PreviewCard>
      );
    }
    if (cardData.type === 'deployment-status') {
      const data = cardData.data as any;
      const deployUrl = resolvePreviewUrl(data.deployUrl);
      return (
        <DeploymentStatusCard
          key={`preview-card-${index}`}
          deployName={cardData.title || '本机部署'}
          status={data.status}
          progress={data.progress}
          deployUrl={deployUrl}
          errorMsg={data.errorMsg}
          onVisit={() => deployUrl && window.open(deployUrl, '_blank')}
          onRedeploy={async () => {
            if (!data.deploymentId) return;
            await deploymentsApi.redeploy(data.deploymentId);
            message.success('已加入重新部署队列');
          }}
        />
      );
    }
    return null;
  };

  const renderActions = (msg: Message) => {
    const items = [
      {
        key: 'pin', label: msg.isPinned ? '取消固定' : '固定为长期上下文',
        icon: msg.isPinned ? <StarFilled /> : <StarOutlined />,
        onClick: () => { onTogglePinMessage?.(msg.id); message.success(msg.isPinned ? '已取消固定' : '已固定'); },
      },
      { key: 'edit', label: '在编辑器打开', icon: <EditOutlined />, onClick: () => handleOpenCodeEditor('代码编辑', 'generated.ts', msg.content, 'typescript') },
      { key: 'quote', label: '引用', icon: <ShareAltOutlined />, onClick: () => onReply?.(msg) },
      { key: 'regen', label: '重新生成', icon: <ReloadOutlined />, onClick: () => onRegenerate?.(msg) },
    ];
    return (
      <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
        <Button type="text" size="small" icon={<MoreOutlined />} />
      </Dropdown>
    );
  };

  return (
    <>
      <div ref={containerRef} className="message-flow">
        <div className="message-flow-inner">
          {pinnedMessages.length > 0 && (
            <div className="pinned-context">
              <div className="pinned-context-head">
                <h5>★ 长期上下文 · 自动注入 Agent</h5>
                <span className="count">{pinnedMessages.length} 条</span>
              </div>
              {pinnedMessages.map(pinned => (
                <div key={pinned.id} className="pinned-context-item">
                  <span className="from">{pinned.senderName}</span>
                  {pinned.content.length > 140 ? pinned.content.slice(0, 140) + '…' : pinned.content}
                </div>
              ))}
            </div>
          )}

          {messages.length === 0 ? (
            <div className="message-flow-empty">
              <div className="glyph">~</div>
              <span className="kicker">EMPTY THREAD</span>
              <p>给 Agent 留下第一条任务,或 <code>@</code> 一个 Agent 开始协作。</p>
            </div>
          ) : (
            decorated.map(({ msg, continued, dayMark }) => {
              const kind = classifySender(msg, agentMap);
              const previewCards = msg.metadata?.preview_cards || [];
              const quoted = msg.quotedMessageId ? messagesById.get(msg.quotedMessageId) : undefined;
              const live = msg.status === 'streaming';
              const reactions: any[] = Array.isArray((msg.metadata as any)?.reactions) ? (msg.metadata as any).reactions : [];

              return (
                <div key={msg.id}>
                  {dayMark && (
                    <div className="day-divider">
                      {dayjs(msg.createdAt).format('YYYY / MM / DD · ddd')}
                    </div>
                  )}
                  <article
                    ref={node => { messageRefs.current[msg.id] = node; }}
                    className={`msg msg--${kind}${continued ? ' msg--continued' : ''}${live ? ' msg--live' : ''}${activeMessageId === msg.id ? ' msg--search-hit' : ''}`}
                  >
                    <div className="msg-av-wrap">
                      <span className={`av av--${kind}`}>
                        {(msg.senderName || '?')[0].toUpperCase()}
                      </span>
                      {live ? <span className="av-presence av-presence--live" /> : kind !== 'user' && <span className="av-presence" />}
                    </div>
                    <span className="msg-hover-time">{dayjs(msg.createdAt).format('HH:mm')}</span>
                    <div className="msg-body">
                      <header className="msg-meta">
                        <span className="msg-sender">{msg.senderName}</span>
                        {kind !== 'user' && <span className={`provider-chip provider-chip--${kind}`}>{providerLabel(kind)}</span>}
                        <span className="msg-time">{dayjs(msg.createdAt).format('HH:mm')}</span>
                        {live && <span className="status status--live">运行中</span>}
                        {msg.isPinned && <span className="msg-pinned-tag">★ PINNED</span>}
                      </header>

                      <div className="msg-actions">
                        <Button type="text" size="small" icon={<CommentOutlined />} onClick={() => onReply?.(msg)} title="引用回复" />
                        <Button type="text" size="small" icon={<SmileOutlined />} title="添加反应" />
                        {renderActions(msg)}
                      </div>

                      {quoted && (
                        <div className="msg-quote">
                          <span className="from">引用 · {quoted.senderName}</span>
                          {quoted.content.slice(0, 160)}{quoted.content.length > 160 ? '…' : ''}
                        </div>
                      )}

                      <div className="msg-content">
                        <ReactMarkdown
                          components={{
                            code({ className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              const codeContent = String(children).replace(/\n$/, '');
                              return match ? (
                                <div className="msg-code">
                                  <div className="msg-code-head">
                                    <span className="lang">{match[1]}</span>
                                    <span className="ops">
                                      <Button
                                        size="small"
                                        type="text"
                                        icon={copiedCode === codeContent ? <CheckOutlined /> : <CopyOutlined />}
                                        onClick={() => handleCopyCode(codeContent)}
                                      >
                                        {copiedCode === codeContent ? '已复制' : '复制'}
                                      </Button>
                                      <Button size="small" type="text" icon={<EditOutlined />}
                                        onClick={() => handleOpenCodeEditor('代码编辑', `code.${match[1]}`, codeContent, match[1])}>
                                        编辑
                                      </Button>
                                    </span>
                                  </div>
                                  <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{
                                      margin: 0,
                                      background: 'transparent',
                                      padding: '12px 14px',
                                      fontSize: 12.5,
                                      fontFamily: '"JetBrains Mono", monospace',
                                    }}
                                  >
                                    {codeContent}
                                  </SyntaxHighlighter>
                                </div>
                              ) : (
                                <code className={className} {...props}>{children}</code>
                              );
                            },
                            p({ children }) {
                              if (typeof children === 'string') return <p>{renderTextWithMentions(children, agents)}</p>;
                              if (Array.isArray(children)) {
                                return <p>{children.map((c, i) => typeof c === 'string' ? <span key={i}>{renderTextWithMentions(c, agents)}</span> : c)}</p>;
                              }
                              return <p>{children}</p>;
                            },
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>

                      {reactions.length > 0 && (
                        <div className="msg-reactions">
                          {reactions.map((r: any, i: number) => (
                            <button key={i} className="reaction-chip">
                              <span>{r.emoji || '👍'}</span>
                              <span className="count">{r.count || 1}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {previewCards.length > 0 && (
                        <div className="msg-attachments">
                          {previewCards.map((card, idx) => renderPreviewCard(card, idx))}
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              );
            })
          )}
        </div>
      </div>
      <FullPreviewModal
        visible={fullPreviewState.visible}
        title={fullPreviewState.title}
        type={fullPreviewState.type}
        data={fullPreviewState.data}
        onClose={() => setFullPreviewState((prev) => ({ ...prev, visible: false }))}
      />
      <CodeEditorModal
        visible={codeEditorState.visible}
        title={codeEditorState.title}
        fileName={codeEditorState.fileName}
        initialCode={codeEditorState.code}
        language={codeEditorState.language}
        onClose={() => setCodeEditorState((prev) => ({ ...prev, visible: false }))}
        onSave={() => message.success('代码已保存')}
        onSelectCodeForModify={(selectedCode) => onSelectCodeForModify?.(selectedCode)}
      />
    </>
  );
};

export default MessageFlow;
