import { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Space, Dropdown, Avatar } from 'antd';
import { SendOutlined, CodeOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Agent } from '../types';

const { TextArea } = Input;

const IconMap: Record<string, React.FC<any>> = {
  'CodeOutlined': CodeOutlined,
  'RobotOutlined': RobotOutlined,
  'ThunderboltOutlined': ThunderboltOutlined,
};

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  agents?: Agent[];
  initialContent?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, disabled, agents = [], initialContent = '' }) => {
  const [content, setContent] = useState(initialContent);
  const [mentionDropdownVisible, setMentionDropdownVisible] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const textAreaRef = useRef<any>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
    }
  }, [initialContent]);

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleSend = () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || disabled) return;
    onSendMessage(trimmedContent);
    setContent('');
    setMentionDropdownVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionDropdownVisible && filteredAgents.length > 0) {
        e.preventDefault();
        insertMention(filteredAgents[0]);
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const insertMention = useCallback((agent: Agent) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const newContent = 
        textBeforeCursor.slice(0, lastAtIndex) + 
        `@${agent.name} ` + 
        textAfterCursor;
      setContent(newContent);
    } else {
      setContent(content + `@${agent.name} `);
    }
    
    setMentionDropdownVisible(false);
    setMentionFilter('');
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
      }
    }, 10);
  }, [content, cursorPosition]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart;
    setContent(newValue);
    setCursorPosition(newCursorPos);

    const textBeforeCursor = newValue.slice(0, newCursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionFilter(textAfterAt);
        setMentionDropdownVisible(true);
        return;
      }
    }
    setMentionDropdownVisible(false);
    setMentionFilter('');
  };

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, []);

  const dropdownItems = filteredAgents.map((agent) => {
    const IconComponent = IconMap[agent.iconType] || CodeOutlined;
    return {
      key: agent.id,
      label: (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 0',
          }}
          onClick={() => insertMention(agent)}
        >
          <Avatar
            size={32}
            style={{ backgroundColor: agent.color }}
            icon={<IconComponent />}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{agent.description}</div>
          </div>
        </div>
      ),
    };
  });

  return (
    <div
      style={{
        padding: '16px 24px',
        borderTop: '1px solid #f0f0f5',
        backgroundColor: '#fff',
      }}
    >
      <Space.Compact style={{ width: '100%', gap: 8 }}>
        <Dropdown
          open={mentionDropdownVisible && filteredAgents.length > 0}
          menu={{ items: dropdownItems }}
          placement="topLeft"
          trigger={[]}
          overlayStyle={{ minWidth: 300 }}
        >
          <TextArea
            ref={textAreaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (@ 来提及 Agent，Shift + Enter 换行)"
            autoSize={{ minRows: 1, maxRows: 6 }}
            style={{ flex: 1, resize: 'none' }}
            disabled={disabled}
          />
        </Dropdown>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={!content.trim() || disabled}
          style={{ height: 'auto' }}
        >
          发送
        </Button>
      </Space.Compact>
    </div>
  );
};

export default MessageInput;
