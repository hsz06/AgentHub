import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, List, Modal, Space, Tabs, Typography, message } from 'antd';
import ReactMarkdown from 'react-markdown';
import SandboxIframeWebPreview from './SandboxIframeWebPreview';
import { artifactsApi } from '../services';

const { Text, Title } = Typography;

interface Slide {
  title: string;
  body: string;
  background?: string;
}

interface Props {
  artifact: any | null;
  onClose: () => void;
  onSaved: () => void;
}

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

const ArtifactEditorModal: React.FC<Props> = ({ artifact, onClose, onSaved }) => {
  const [content, setContent] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const [historyVisible, setHistoryVisible] = useState(false);
  useEffect(() => {
    setContent(artifact?.versions?.[0]?.content || '');
    setActiveSlide(0);
  }, [artifact]);
  const slides = useMemo<Slide[]>(() => {
    if (artifact?.type !== 'slides') return [];
    try { return JSON.parse(content).slides || []; } catch { return []; }
  }, [artifact, content]);
  const updateSlides = (updated: Slide[]) => setContent(JSON.stringify({ slides: updated }, null, 2));
  const save = async () => {
    if (!artifact) return;
    await artifactsApi.createVersion(artifact.id, content);
    message.success('New artifact version saved');
    onSaved();
    onClose();
  };

  return <Modal title={artifact ? `Edit ${artifact.name}` : 'Edit artifact'} open={Boolean(artifact)} onCancel={onClose} width={960} footer={<Space>
    <Button onClick={onClose}>Cancel</Button>
    <Button onClick={() => setHistoryVisible(true)}>Versions</Button>
    {window.agentHubDesktop && artifact && <Button onClick={() => window.agentHubDesktop?.exportArtifact({ fileName: artifact.name, content })}>Export locally</Button>}
    {artifact?.type === 'slides' && <Button onClick={async () => downloadBlob(await artifactsApi.exportPptx(artifact.id), `${artifact.name}.pptx`)}>Export PPTX</Button>}
    <Button type="primary" onClick={save}>Save version</Button>
  </Space>}>
    {artifact?.type === 'document' && <Tabs items={[
      { key: 'edit', label: 'Markdown', children: <Input.TextArea value={content} onChange={event => setContent(event.target.value)} autoSize={{ minRows: 18, maxRows: 25 }} /> },
      { key: 'preview', label: 'Preview', children: <Card style={{ minHeight: 360 }}><ReactMarkdown>{content}</ReactMarkdown></Card> },
    ]} />}
    {artifact?.type === 'web' && <Tabs items={[
      { key: 'edit', label: 'HTML', children: <Input.TextArea value={content} onChange={event => setContent(event.target.value)} autoSize={{ minRows: 18, maxRows: 25 }} style={{ fontFamily: 'monospace' }} /> },
      { key: 'preview', label: 'Secure preview', children: <SandboxIframeWebPreview htmlContent={content} height={420} /> },
    ]} />}
    {artifact?.type === 'slides' && <Space align="start" style={{ width: '100%' }}>
      <div style={{ width: 220 }}>
        <Button block onClick={() => {
          const next = [...slides, { title: 'New slide', body: '' }];
          updateSlides(next);
          setActiveSlide(next.length - 1);
        }}>Add slide</Button>
        <List dataSource={slides} renderItem={(slide, index) => (
          <List.Item onClick={() => setActiveSlide(index)} style={{ cursor: 'pointer', background: activeSlide === index ? '#e6f4ff' : undefined }}>
            {index + 1}. {slide.title || 'Untitled'}
          </List.Item>
        )} />
      </div>
      {slides[activeSlide] && <div style={{ flex: 1 }}>
        <Input value={slides[activeSlide].title} onChange={event => updateSlides(slides.map((slide, index) => index === activeSlide ? { ...slide, title: event.target.value } : slide))} placeholder="Title" />
        <Input.TextArea value={slides[activeSlide].body} onChange={event => updateSlides(slides.map((slide, index) => index === activeSlide ? { ...slide, body: event.target.value } : slide))} rows={6} placeholder="Body" style={{ marginTop: 8 }} />
        <Input value={slides[activeSlide].background || ''} onChange={event => updateSlides(slides.map((slide, index) => index === activeSlide ? { ...slide, background: event.target.value } : slide))} placeholder="#ffffff background" style={{ marginTop: 8 }} />
        <Card style={{ minHeight: 220, marginTop: 12, background: slides[activeSlide].background || '#fff' }}>
          <Title level={2}>{slides[activeSlide].title}</Title>
          <Text>{slides[activeSlide].body}</Text>
        </Card>
      </div>}
    </Space>}
    {artifact && !['document', 'web', 'slides'].includes(artifact.type) && <Input.TextArea value={content} onChange={event => setContent(event.target.value)} autoSize={{ minRows: 18, maxRows: 25 }} style={{ fontFamily: 'monospace' }} />}
    <Modal title="Version history" open={historyVisible} footer={null} onCancel={() => setHistoryVisible(false)}>
      <List dataSource={artifact?.versions || []} renderItem={(version: any) => <List.Item actions={[
        <Button key="restore" onClick={() => { setContent(version.content); setHistoryVisible(false); message.info(`Version ${version.version} loaded. Save to create a restored version.`); }}>Restore</Button>
      ]}><List.Item.Meta title={`Version ${version.version}`} description={new Date(version.createdAt).toLocaleString()} /></List.Item>} />
    </Modal>
  </Modal>;
};

export default ArtifactEditorModal;
