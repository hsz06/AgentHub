import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Input, Button, Dropdown, Tooltip, Upload, message } from 'antd';
import {
  SendOutlined,
  CodeOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  PaperClipOutlined,
  PictureOutlined,
  UserAddOutlined,
  BoldOutlined,
  ItalicOutlined,
  UnorderedListOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { Agent } from '../types';

const { TextArea } = Input;

const IconMap: Record<string, React.FC<any>> = {
  'CodeOutlined': CodeOutlined,
  'RobotOutlined': RobotOutlined,
  'ThunderboltOutlined': ThunderboltOutlined,
};

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: AttachmentDraft[]) => void;
  disabled?: boolean;
  agents?: Agent[];
  currentAgentIds?: string[];
  initialContent?: string;
  onUploadAttachment?: (file: File) => Promise<AttachmentDraft>;
}

export interface AttachmentDraft {
  artifactId: string;
  name: string;
  type: string;
  mimeType?: string;
  size?: number;
  url?: string;
}

function classifyAdapter(adapter?: string | null): 'claude' | 'codex' | 'opencode' | 'orchestrator' | 'user' {
  const v = String(adapter || '').toLowerCase();
  if (v.includes('claude')) return 'claude';
  if (v.includes('codex')) return 'codex';
  if (v.includes('opencode')) return 'opencode';
  if (v.includes('mimo') || v.includes('orchestrator')) return 'orchestrator';
  return 'user';
}

function parseList(value?: string | string[]) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]') as string[]; } catch { return []; }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionPattern(agentName: string, flags = '') {
  return new RegExp(`@${escapeRegExp(agentName)}(?=$|\\s|[,.!?;:，。！？；：、）)\\]}])`, flags);
}

function isAgentMentioned(content: string, agent: Agent) {
  return mentionPattern(agent.name).test(content);
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, disabled, agents = [], currentAgentIds = [], initialContent = '', onUploadAttachment }) => {
  const [content, setContent] = useState(initialContent);
  const [mentionDropdownVisible, setMentionDropdownVisible] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const textAreaRef = useRef<any>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  useEffect(() => { if (initialContent) setContent(initialContent); }, [initialContent]);

  const currentAgentSet = useMemo(() => new Set(currentAgentIds), [currentAgentIds]);
  const filteredAgents = useMemo(() => {
    const keyword = mentionFilter.trim().toLowerCase();
    const rank = (agent: Agent) => {
      if (currentAgentSet.has(agent.id)) return 0;
      if (agent.adapterType.endsWith('-cli')) return 1;
      if (agent.isBuiltin) return 2;
      return 3;
    };
    return agents
      .filter(agent => {
        const haystack = [
          agent.name,
          agent.description || '',
          agent.model || '',
          agent.adapterType,
          ...parseList(agent.capabilities),
        ].join(' ').toLowerCase();
        return !keyword || haystack.includes(keyword);
      })
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [agents, currentAgentSet, mentionFilter]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [mentionFilter, agents.length]);

  const mentionedAgents = useMemo(
    () => agents.filter(agent => isAgentMentioned(content, agent)),
    [agents, content]
  );

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed, attachments);
    setContent('');
    setAttachments([]);
    setMentionDropdownVisible(false);
  };

  const uploadAttachment = async (file: File) => {
    if (!onUploadAttachment) {
      message.warning('附件上传暂不可用');
      return false;
    }
    setUploading(true);
    try {
      const uploaded = await onUploadAttachment(file);
      setAttachments(previous => [...previous, uploaded]);
      message.success(`${file.name} 已添加`);
    } catch (error: any) {
      message.error(error.message || '附件上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionDropdownVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(index => Math.min(index + 1, filteredAgents.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(index => Math.max(index - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionDropdownVisible(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionDropdownVisible && filteredAgents.length > 0) {
        e.preventDefault();
        insertMention(filteredAgents[highlightedIndex] || filteredAgents[0]);
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const insertMention = useCallback((agent: Agent) => {
    const before = content.slice(0, cursorPosition);
    const after = content.slice(cursorPosition);
    const lastAt = before.lastIndexOf('@');
    if (lastAt !== -1) {
      setContent(before.slice(0, lastAt) + `@${agent.name} ` + after);
    } else {
      setContent(content + (content.endsWith(' ') || !content ? '' : ' ') + `@${agent.name} `);
    }
    setMentionDropdownVisible(false);
    setMentionFilter('');
    setTimeout(() => textAreaRef.current?.focus(), 10);
  }, [content, cursorPosition]);

  const removeMention = (agent: Agent) => {
    setContent(content.replace(mentionPattern(agent.name, 'g'), '').replace(/\s+/g, ' ').trim());
    setTimeout(() => textAreaRef.current?.focus(), 10);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    setContent(value);
    setCursorPosition(cursor);
    const before = value.slice(0, cursor);
    const lastAt = before.lastIndexOf('@');
    if (lastAt !== -1) {
      const afterAt = before.slice(lastAt + 1);
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setMentionFilter(afterAt);
        setMentionDropdownVisible(true);
        return;
      }
    }
    setMentionDropdownVisible(false);
    setMentionFilter('');
  };

  const wrapWith = (left: string, right: string = left) => {
    const ta = textAreaRef.current?.resizableTextArea?.textArea;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = content.slice(start, end);
    const next = content.slice(0, start) + left + sel + right + content.slice(end);
    setContent(next);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + left.length;
      ta.selectionEnd = end + left.length;
    }, 0);
  };

  useEffect(() => { textAreaRef.current?.focus(); }, []);

  const openMentionMenu = () => {
    const ta = textAreaRef.current?.resizableTextArea?.textArea;
    const cursor = ta?.selectionStart ?? content.length;
    const before = content.slice(0, cursor);
    const after = content.slice(cursor);
    const next = before.endsWith('@') ? content : `${before}${before && !before.endsWith(' ') ? ' ' : ''}@${after}`;
    setContent(next);
    setCursorPosition((before.endsWith('@') ? cursor : cursor + (before && !before.endsWith(' ') ? 2 : 1)));
    setMentionFilter('');
    setHighlightedIndex(0);
    setMentionDropdownVisible(true);
    setTimeout(() => textAreaRef.current?.focus(), 0);
  };

  const dropdownItems = filteredAgents.map((agent, index) => {
    const Icon = IconMap[agent.iconType] || CodeOutlined;
    const kind = classifyAdapter(agent.adapterType);
    const capabilities = parseList(agent.capabilities).slice(0, 3);
    const current = currentAgentSet.has(agent.id);
    return {
      key: agent.id,
      label: (
        <div className={`mention-option ${index === highlightedIndex ? 'is-active' : ''}`} onMouseEnter={() => setHighlightedIndex(index)} onClick={() => insertMention(agent)}>
          <span className={`av av--sm av--${kind}`}><Icon style={{ fontSize: 12 }} /></span>
          <div className="mention-option-main">
            <div className="mention-option-title">
              <strong>{agent.name}</strong>
              {current && <span className="mention-scope">当前会话</span>}
              {!agent.isBuiltin && <span className="mention-scope mention-scope--custom">自定义</span>}
            </div>
            <div className="mention-option-desc">
              <span>{agent.model || agent.description?.slice(0, 48) || providerLabel(kind)}</span>
              {capabilities.map(item => <em key={item}>{item}</em>)}
            </div>
          </div>
          <span className={`provider-chip provider-chip--${kind}`}>{providerLabel(kind)}</span>
        </div>
      ),
    };
  });

  function providerLabel(kind: string): string {
    if (kind === 'claude') return 'Claude';
    if (kind === 'codex') return 'Codex';
    if (kind === 'opencode') return 'OpenCode';
    if (kind === 'orchestrator') return 'Orch';
    return 'Agent';
  }

  return (
    <div className="message-composer">
      <div className="composer-shell">
        {mentionedAgents.length > 0 && (
          <div className="composer-mention-row">
            {mentionedAgents.map(a => (
              <span key={a.id} className="mention-chip">
                @{a.name}
                <CloseOutlined style={{ fontSize: 9, cursor: 'pointer', marginLeft: 2 }} onClick={() => removeMention(a)} />
              </span>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="composer-attachment-row">
            {attachments.map(item => (
              <span key={item.artifactId} className="attachment-chip">
                {item.type === 'image' ? <PictureOutlined /> : <PaperClipOutlined />}
                {item.name}
                <CloseOutlined
                  style={{ fontSize: 9, cursor: 'pointer', marginLeft: 4 }}
                  onClick={() => setAttachments(previous => previous.filter(existing => existing.artifactId !== item.artifactId))}
                />
              </span>
            ))}
          </div>
        )}

        <div className="composer-textarea-wrap">
          <Dropdown
            overlayClassName="mention-dropdown"
            open={mentionDropdownVisible && filteredAgents.length > 0}
            menu={{ items: dropdownItems }}
            placement="topLeft"
            trigger={[]}
            overlayStyle={{ minWidth: 320 }}
          >
            <TextArea
              ref={textAreaRef}
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder='给 Agent 留言, @ 来指派；/agent name="前端评审" prompt="你负责审查前端体验"'
              autoSize={{ minRows: 1, maxRows: 10 }}
              className="message-composer-input"
              disabled={disabled}
            />
          </Dropdown>
        </div>

        <div className="composer-toolbar">
          <div className="composer-tools">
            <Tooltip title="@ 指派 Agent">
              <Button type="text" icon={<UserAddOutlined />} onClick={openMentionMenu} />
            </Tooltip>
            <Tooltip title="附件">
              <Upload showUploadList={false} beforeUpload={uploadAttachment} disabled={disabled || uploading}>
                <Button type="text" icon={<PaperClipOutlined />} loading={uploading} />
              </Upload>
            </Tooltip>
            <Tooltip title="图片">
              <Upload showUploadList={false} accept="image/*" beforeUpload={uploadAttachment} disabled={disabled || uploading}>
                <Button type="text" icon={<PictureOutlined />} loading={uploading} />
              </Upload>
            </Tooltip>
            <span className="divider" />
            <Tooltip title="加粗"><Button type="text" icon={<BoldOutlined />} onClick={() => wrapWith('**')} /></Tooltip>
            <Tooltip title="斜体"><Button type="text" icon={<ItalicOutlined />} onClick={() => wrapWith('*')} /></Tooltip>
            <Tooltip title="代码"><Button type="text" icon={<CodeOutlined />} onClick={() => wrapWith('`')} /></Tooltip>
            <Tooltip title="列表"><Button type="text" icon={<UnorderedListOutlined />} onClick={() => {
              const next = content + (content.endsWith('\n') || !content ? '' : '\n') + '- ';
              setContent(next);
              setTimeout(() => textAreaRef.current?.focus(), 0);
            }} /></Tooltip>
          </div>
          <div className="composer-right">
            <span className="composer-hint">
              <kbd>⇧</kbd>+<kbd>↵</kbd> 换行 · <kbd>↵</kbd> 发送
            </span>
            <Button
              className="send-btn"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={!content.trim() || disabled}
            >
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
