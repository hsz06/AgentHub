import { useEffect, useState } from 'react';
import { Button, Input, Modal, Space, Tag } from 'antd';
import { CopyOutlined, EditOutlined, SendOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  visible: boolean;
  title: string;
  fileName?: string;
  initialCode: string;
  language?: string;
  onClose: () => void;
  onSave?: (newCode: string) => void;
  onSelectCodeForModify?: (selectedCode: string) => void;
}

const CodeEditorModal: React.FC<Props> = ({
  visible,
  title,
  fileName = 'snippet.ts',
  initialCode,
  language = 'typescript',
  onClose,
  onSelectCodeForModify,
}) => {
  const [code, setCode] = useState(initialCode);
  const [editing, setEditing] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  useEffect(() => {
    setCode(initialCode);
    setEditing(false);
    setSelectedText('');
  }, [initialCode, visible]);

  const captureSelection = () => {
    const selected = window.getSelection()?.toString().trim();
    if (selected) setSelectedText(selected);
  };

  return <Modal
    open={visible}
    title={<Space><span>{title}</span><Tag color="geekblue">{fileName}</Tag></Space>}
    onCancel={onClose}
    footer={null}
    width="90%"
    style={{ top: 20 }}
  >
    <Space style={{ marginBottom: 12 }}>
      <Button icon={<EditOutlined />} onClick={() => setEditing(value => !value)}>{editing ? 'Preview' : 'Edit'}</Button>
      <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(code)}>Copy</Button>
      <Button type="primary" icon={<SendOutlined />} disabled={!selectedText} onClick={() => {
        onSelectCodeForModify?.(selectedText);
        onClose();
      }}>Modify selected code in chat</Button>
    </Space>
    {editing ? <Input.TextArea value={code} onChange={event => setCode(event.target.value)} autoSize={{ minRows: 22, maxRows: 30 }} style={{ fontFamily: 'monospace' }} /> : (
      <div onMouseUp={captureSelection}>
        <SyntaxHighlighter style={vscDarkPlus} language={language} showLineNumbers customStyle={{ minHeight: 480, borderRadius: 8 }}>
          {code}
        </SyntaxHighlighter>
      </div>
    )}
  </Modal>;
};

export default CodeEditorModal;
