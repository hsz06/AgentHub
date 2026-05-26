import { useRef, useEffect, useState } from 'react';
import { Avatar, Empty, Button, Dropdown, Space, message, Popover, Tag, Divider } from 'antd';
import { 
  MoreOutlined, 
  CommentOutlined, 
  ShareAltOutlined, 
  ReloadOutlined, 
  CopyOutlined, 
  CheckOutlined, 
  CodeSandboxOutlined, 
  ExpandOutlined,
  PushpinFilled,
  PushpinOutlined,
  StarFilled,
  StarOutlined,
  SettingOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, PreviewCardData, PreviewCardType } from '../types';
import dayjs from 'dayjs';
import PreviewCard from './PreviewCard';
import SandboxIframeWebPreview from './SandboxIframeWebPreview';
import CodeDiffCard from './CodeDiffCard';
import ImagePreviewCard from './ImagePreviewCard';
import FileAttachmentCard from './FileAttachmentCard';
import DeploymentStatusCard from './DeploymentStatusCard';
import FullPreviewModal from './FullPreviewModal';
import { WebPreviewData, CodeDiffData } from '../types';

interface MessageFlowProps {
  messages: Message[];
  onReply?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onApplyDiff?: (diffData: any) => void;
  onTogglePinMessage?: (msgId: string) => void;
  onSetLongContext?: () => void;
}

interface FullPreviewState {
  visible: boolean;
  title: string;
  type: PreviewCardType;
  data: WebPreviewData | CodeDiffData;
}

const MessageFlow: React.FC<MessageFlowProps> = ({ 
  messages, 
  onReply, 
  onRegenerate, 
  onApplyDiff, 
  onTogglePinMessage,
  onSetLongContext
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullPreviewState, setFullPreviewState] = useState<FullPreviewState>({
    visible: false,
    title: '',
    type: 'web-preview',
    data: {},
  });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const pinnedMessages = messages.filter(m => m.isPinned === true);
  const normalMessages = messages.filter(m => m.isPinned !== true);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      message.success('代码已复制到剪贴板！');
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const renderPreviewCard = (cardData: PreviewCardData, index: number) => {
    const handleOpenFullScreen = () => {
      setFullPreviewState({
        visible: true,
        title: cardData.title,
        type: cardData.type,
        data: cardData.data,
      });
    };

    if (cardData.type === 'web-preview') {
      const data = cardData.data as WebPreviewData;
      return (
        <PreviewCard
          key={`preview-card-${index}`}
          title={cardData.title}
          description={cardData.description}
          onFullScreen={handleOpenFullScreen}
        >
          <SandboxIframeWebPreview
            url={data.url}
            htmlContent={data.htmlContent}
            height={280}
          />
        </PreviewCard>
      );
    }
    if (cardData.type === 'code-diff') {
      const data = cardData.data as CodeDiffData;
      return (
        <div key={`preview-card-${index}`} style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 8 }}>
            <Button
              size="small"
              type="primary"
              icon={<CodeSandboxOutlined />}
              onClick={() => {
                onApplyDiff?.(data);
                message.success('Diff已一键应用！');
              }}
            >
              一键应用
            </Button>
            <Button
              size="small"
              icon={<ExpandOutlined />}
              onClick={handleOpenFullScreen}
            >
              展开
            </Button>
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
        <ImagePreviewCard
          key={`preview-card-${index}`}
          imageUrl={data.imageUrl}
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
          onDownload={() => alert('开始下载文件...')}
        />
      );
    }
    if (cardData.type === 'deployment-status') {
      const data = cardData.data as any;
      return (
        <DeploymentStatusCard
          key={`preview-card-${index}`}
          deployName={cardData.title || '站点部署'}
          status={data.status}
          progress={data.progress}
          deployUrl={data.deployUrl}
          errorMsg={data.errorMsg}
          onVisit={() => window.open(data.deployUrl, '_blank')}
          onRedeploy={() => alert('重新部署')}
        />
      );
    }
    return null;
  };

  const renderMessageActions = (msg: Message) => {
    const actions = [
      {
        key: 'pin-unpin',
        label: msg.isPinned ? '取消固定' : '固定为长期上下文',
        icon: msg.isPinned ? <StarFilled /> : <StarOutlined />,
        onClick: () => {
          onTogglePinMessage?.(msg.id);
          message.success(msg.isPinned ? '已取消固定' : '已固定为长期上下文！');
        },
      },
      {
        key: 'reply',
        label: '回复',
        icon: <CommentOutlined />,
        onClick: () => {
          onReply?.(msg);
          message.info('已引用该消息进行回复');
        },
      },
      {
        key: 'quote',
        label: '引用',
        icon: <ShareAltOutlined />,
        onClick: () => {
          message.info('已引用该消息内容');
        },
      },
      {
        key: 'regenerate',
        label: '重新生成',
        icon: <ReloadOutlined />,
        onClick: () => {
          onRegenerate?.(msg);
          message.info('正在重新生成该消息...');
        },
      },
    ];
    return (
      <Dropdown menu={{ items: actions }} trigger={['click']}>
        <Button type="text" size="small" icon={<MoreOutlined />} style={{ color: '#999' }} />
      </Dropdown>
    );
  };

  return (
    <>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px 24px',
          backgroundColor: '#f7f8fa',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {pinnedMessages.length > 0 && (
          <div style={{ 
            marginBottom: 16, 
            backgroundColor: '#fffbe6', 
            borderRadius: 12, 
            border: '1px solid #ffe58f',
            padding: '12px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <StarFilled style={{ color: '#faad14', fontSize: 16 }} />
              <Tag color="gold" icon={<SettingOutlined />}>长期上下文</Tag>
              <span style={{ fontSize: 13, color: '#8c8c8c', marginLeft: 'auto' }}>
                共 {pinnedMessages.length} 条关键消息已自动加入Agent上下文
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pinnedMessages.map(pinnedMsg => (
                <div key={pinnedMsg.id} style={{
                  padding: '8px 12px',
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  borderLeft: '3px solid #faad14',
                }}>
                  <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5, wordBreak: 'break-all' }}>
                    {pinnedMsg.content.length > 100 ? pinnedMsg.content.slice(0, 100) + '...' : pinnedMsg.content}
                  </div>
                </div>
              ))}
            </div>
            <Divider style={{ margin: '12px 0 0 0', borderColor: '#ffe58f' }} />
          </div>
        )}

        {messages.length === 0 ? (
          <Empty
            description="暂无消息，开始对话吧"
            style={{ marginTop: 100 }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {normalMessages.map((message) => {
              const isUser = message.type === 'user';
              const previewCards = message.metadata?.preview_cards || [];
              return (
                <div
                  key={message.id}
                  style={{
                    display: 'flex',
                    flexDirection: isUser ? 'row-reverse' : 'row',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <Avatar
                    src={message.senderAvatar}
                    style={{
                      backgroundColor: isUser ? '#1890ff' : '#52c41a',
                      flexShrink: 0,
                    }}
                  >
                    {message.senderName[0]}
                  </Avatar>
                  <div
                    style={{
                      maxWidth: '75%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: isUser ? 'flex-end' : 'flex-start',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {message.senderName}
                      </span>
                      <span style={{ fontSize: 11, color: '#ccc' }}>
                        {dayjs(message.createdAt).format('HH:mm')}
                      </span>
                      {message.isPinned && <Tag color="gold" icon={<StarFilled />} style={{ fontSize: 11, padding: '0 4px', height: 18 }}>固定</Tag>}
                      {!isUser && renderMessageActions(message)}
                    </div>
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        backgroundColor: isUser ? '#1890ff' : (message.isPinned ? '#fffbe6' : '#fff'),
                        color: isUser ? '#fff' : '#333',
                        boxShadow: isUser ? 'none' : '0 2px 8px rgba(0,0,0,0.08)',
                        wordBreak: 'break-word',
                      }}
                    >
                      <ReactMarkdown
                        components={{
                          code({ node, inline, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeContent = String(children).replace(/\n$/, '');
                            return !inline && match ? (
                              <div style={{ position: 'relative', margin: '12px 0', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{
                                  position: 'absolute',
                                  top: 8,
                                  right: 8,
                                  zIndex: 10,
                                }}>
                                  <Button
                                    size="small"
                                    type="text"
                                    icon={copiedCode === codeContent ? <CheckOutlined /> : <CopyOutlined />}
                                    onClick={() => handleCopyCode(codeContent)}
                                    style={{
                                      color: copiedCode === codeContent ? '#52c41a' : '#999',
                                      backgroundColor: 'rgba(0,0,0,0.4)',
                                    }}
                                  >
                                    {copiedCode === codeContent ? '已复制' : '复制'}
                                  </Button>
                                </div>
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{
                                    margin: 0,
                                    borderRadius: 8,
                                    fontSize: 14,
                                  }}
                                  {...props}
                                >
                                  {codeContent}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code
                                className={className}
                                style={{
                                  backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 14,
                                }}
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                          p({ children }) {
                            return (
                              <p
                                style={{
                                  margin: '4px 0',
                                  lineHeight: 1.6,
                                  fontSize: 14,
                                }}
                              >
                                {children}
                              </p>
                            );
                          },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                    {previewCards.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                        {previewCards.map((card, idx) => renderPreviewCard(card, idx))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <FullPreviewModal
        visible={fullPreviewState.visible}
        title={fullPreviewState.title}
        type={fullPreviewState.type}
        data={fullPreviewState.data}
        onClose={() => setFullPreviewState((prev) => ({ ...prev, visible: false }))}
      />
    </>
  );
};

export default MessageFlow;
