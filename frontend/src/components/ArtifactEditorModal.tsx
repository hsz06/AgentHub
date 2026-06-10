import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Input, List, Modal, Space, Tabs, Typography, message } from 'antd';
import ReactMarkdown from 'react-markdown';
import SandboxIframeWebPreview from './SandboxIframeWebPreview';
import { artifactsApi } from '../services';

const { Text, Title } = Typography;

interface Slide {
  title: string;
  body: string;
  background?: string;
  image?: string;
}

interface Props {
  artifact: any | null;
  mode?: 'preview' | 'edit';
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

const ArtifactEditorModal: React.FC<Props> = ({ artifact, mode = 'edit', onClose, onSaved }) => {
  const [content, setContent] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [compareVersion, setCompareVersion] = useState<any | null>(null);
  const [slideShowVisible, setSlideShowVisible] = useState(false);
  const readOnly = mode === 'preview';
  useEffect(() => {
    setContent(artifact?.versions?.[0]?.content || '');
    setActiveSlide(0);
    setCompareVersion(null);
    setSlideShowVisible(false);
  }, [artifact]);
  const slides = useMemo<Slide[]>(() => {
    if (artifact?.type !== 'slides') return [];
    try { return JSON.parse(content).slides || []; } catch { return []; }
  }, [artifact, content]);
  const updateSlides = (updated: Slide[]) => setContent(JSON.stringify({ slides: updated }, null, 2));
  const moveSlide = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    updateSlides(next);
    setActiveSlide(target);
  };
  const deleteSlide = (index: number) => {
    const next = slides.filter((_, current) => current !== index);
    updateSlides(next);
    setActiveSlide(Math.max(0, Math.min(index, next.length - 1)));
  };
  const save = async () => {
    if (!artifact) return;
    await artifactsApi.createVersion(artifact.id, content);
    message.success('New artifact version saved');
    onSaved();
    onClose();
  };

  const renderReadOnlyPreview = () => {
    if (!artifact) return null;
    if (artifact.type === 'document') return <Card className="artifact-rendered-preview"><ReactMarkdown>{content}</ReactMarkdown></Card>;
    if (artifact.type === 'web') return <SandboxIframeWebPreview htmlContent={content} height={520} />;
    if (artifact.type === 'slides') return <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" disabled={!slides.length} onClick={() => setSlideShowVisible(true)}>Play slides</Button>
        <Text type="secondary">{slides.length} slide(s)</Text>
      </Space>
      <div className="artifact-slides-preview">
        {slides.map((slide, index) => (
          <Card key={index} className="artifact-slide-card" style={{ background: slide.background || '#fff' }}>
            <span className="kicker">SLIDE {index + 1}</span>
            <Title level={3}>{slide.title || 'Untitled'}</Title>
            {slide.image && <img className="slide-inline-image" src={slide.image} alt={slide.title || `Slide ${index + 1}`} />}
            <Text>{slide.body}</Text>
          </Card>
        ))}
        {!slides.length && <Card>No slides available.</Card>}
      </div>
    </>;
    return <Input.TextArea readOnly value={content} autoSize={{ minRows: 18, maxRows: 30 }} style={{ fontFamily: 'monospace' }} />;
  };

  const exportVersion = (version: any) => {
    if (!artifact) return;
    downloadBlob(new Blob([version.content || ''], { type: 'text/plain;charset=utf-8' }), `${artifact.name}.v${version.version}`);
  };

  return <Drawer
    className="artifact-workspace-drawer"
    title={artifact ? `${readOnly ? 'Preview' : 'Edit'} ${artifact.name}` : 'Artifact'}
    open={Boolean(artifact)}
    onClose={onClose}
    width={960}
    footer={<Space wrap>
    <Button onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
    <Button onClick={() => setHistoryVisible(true)}>Versions</Button>
    {window.agentHubDesktop && artifact && <Button onClick={() => window.agentHubDesktop?.exportArtifact({ fileName: artifact.name, content })}>Export locally</Button>}
    {artifact?.type === 'slides' && <Button disabled={!slides.length} onClick={() => setSlideShowVisible(true)}>Play</Button>}
    {artifact?.type === 'slides' && <Button onClick={async () => downloadBlob(await artifactsApi.exportPptx(artifact.id), `${artifact.name}.pptx`)}>Export PPTX</Button>}
    {!readOnly && <Button type="primary" onClick={save}>Save version</Button>}
  </Space>}>
    {readOnly ? renderReadOnlyPreview() : artifact?.type === 'document' && <Tabs items={[
      { key: 'edit', label: 'Markdown', children: <Input.TextArea value={content} onChange={event => setContent(event.target.value)} autoSize={{ minRows: 18, maxRows: 25 }} /> },
      { key: 'preview', label: 'Preview', children: <Card style={{ minHeight: 360 }}><ReactMarkdown>{content}</ReactMarkdown></Card> },
    ]} />}
    {!readOnly && artifact?.type === 'web' && <Tabs items={[
      { key: 'edit', label: 'HTML', children: <Input.TextArea value={content} onChange={event => setContent(event.target.value)} autoSize={{ minRows: 18, maxRows: 25 }} style={{ fontFamily: 'monospace' }} /> },
      { key: 'preview', label: 'Secure preview', children: <SandboxIframeWebPreview htmlContent={content} height={420} /> },
    ]} />}
    {!readOnly && artifact?.type === 'slides' && <Space align="start" className="artifact-slides-editor">
      <div className="artifact-slide-list">
        <Space.Compact block>
          <Button onClick={() => {
            const next = [...slides, { title: 'New slide', body: '' }];
            updateSlides(next);
            setActiveSlide(next.length - 1);
          }}>Add</Button>
          <Button disabled={!slides.length} onClick={() => setSlideShowVisible(true)}>Play</Button>
        </Space.Compact>
        <List dataSource={slides} renderItem={(slide, index) => (
          <List.Item className={activeSlide === index ? 'is-active' : ''} onClick={() => setActiveSlide(index)}>
            <div className="slide-row-title">{index + 1}. {slide.title || 'Untitled'}</div>
            <Space size={4}>
              <Button size="small" disabled={index === 0} onClick={event => { event.stopPropagation(); moveSlide(index, -1); }}>↑</Button>
              <Button size="small" disabled={index === slides.length - 1} onClick={event => { event.stopPropagation(); moveSlide(index, 1); }}>↓</Button>
              <Button size="small" danger onClick={event => { event.stopPropagation(); deleteSlide(index); }}>×</Button>
            </Space>
          </List.Item>
        )} />
      </div>
      {slides[activeSlide] && <div style={{ flex: 1 }}>
        <Input value={slides[activeSlide].title} onChange={event => updateSlides(slides.map((slide, index) => index === activeSlide ? { ...slide, title: event.target.value } : slide))} placeholder="Title" />
        <Input.TextArea value={slides[activeSlide].body} onChange={event => updateSlides(slides.map((slide, index) => index === activeSlide ? { ...slide, body: event.target.value } : slide))} rows={6} placeholder="Body" style={{ marginTop: 8 }} />
        <Input value={slides[activeSlide].background || ''} onChange={event => updateSlides(slides.map((slide, index) => index === activeSlide ? { ...slide, background: event.target.value } : slide))} placeholder="#ffffff background" style={{ marginTop: 8 }} />
        <Input value={slides[activeSlide].image || ''} onChange={event => updateSlides(slides.map((slide, index) => index === activeSlide ? { ...slide, image: event.target.value } : slide))} placeholder="Image URL or data:image/... base64" style={{ marginTop: 8 }} />
        <Card style={{ minHeight: 220, marginTop: 12, background: slides[activeSlide].background || '#fff' }}>
          <Title level={2}>{slides[activeSlide].title}</Title>
          {slides[activeSlide].image && <img className="slide-inline-image" src={slides[activeSlide].image} alt={slides[activeSlide].title || 'Slide image'} />}
          <Text>{slides[activeSlide].body}</Text>
        </Card>
      </div>}
    </Space>}
    {!readOnly && artifact && !['document', 'web', 'slides'].includes(artifact.type) && <Input.TextArea value={content} onChange={event => setContent(event.target.value)} autoSize={{ minRows: 18, maxRows: 25 }} style={{ fontFamily: 'monospace' }} />}
    <Modal title="Version history" open={historyVisible} footer={null} onCancel={() => setHistoryVisible(false)}>
      <List dataSource={artifact?.versions || []} renderItem={(version: any) => <List.Item actions={[
        <Button key="compare" onClick={() => setCompareVersion(version)}>Compare</Button>,
        <Button key="export" onClick={() => exportVersion(version)}>Export</Button>,
        ...(!readOnly ? [
          <Button key="restore" onClick={() => { setContent(version.content); setHistoryVisible(false); message.info(`Version ${version.version} loaded. Save to create a restored version.`); }}>Restore</Button>
        ] : []),
      ]}><List.Item.Meta title={`Version ${version.version}`} description={new Date(version.createdAt).toLocaleString()} /></List.Item>} />
    </Modal>
    <Drawer
      className="artifact-version-compare-drawer"
      title={compareVersion ? `Compare v${compareVersion.version} with current` : 'Compare versions'}
      open={Boolean(compareVersion)}
      onClose={() => setCompareVersion(null)}
      width={920}
    >
      {compareVersion && <div className="artifact-version-compare">
        <section>
          <div className="compare-head">
            <strong>VERSION {compareVersion.version}</strong>
            <Text type="secondary">{new Date(compareVersion.createdAt).toLocaleString()}</Text>
          </div>
          <pre>{compareVersion.content || ''}</pre>
        </section>
        <section>
          <div className="compare-head">
            <strong>{readOnly ? 'LATEST' : 'CURRENT DRAFT'}</strong>
            <Text type="secondary">{content.length} chars</Text>
          </div>
          <pre>{content || ''}</pre>
        </section>
      </div>}
    </Drawer>
    <Drawer
      className="artifact-slideshow-drawer"
      title={slides[activeSlide] ? `Slide ${activeSlide + 1} / ${slides.length}` : 'Slides'}
      open={slideShowVisible}
      onClose={() => setSlideShowVisible(false)}
      width={980}
      extra={<Space>
        <Button disabled={activeSlide <= 0} onClick={() => setActiveSlide(activeSlide - 1)}>Previous</Button>
        <Button disabled={activeSlide >= slides.length - 1} onClick={() => setActiveSlide(activeSlide + 1)}>Next</Button>
      </Space>}
    >
      {slides[activeSlide] ? <div className="artifact-slideshow-stage" style={{ background: slides[activeSlide].background || '#fff' }}>
        <span className="kicker">SLIDE {activeSlide + 1}</span>
        <Title>{slides[activeSlide].title || 'Untitled'}</Title>
        {slides[activeSlide].image && <img className="slide-hero-image" src={slides[activeSlide].image} alt={slides[activeSlide].title || 'Slide image'} />}
        <Text>{slides[activeSlide].body}</Text>
      </div> : <Card>No slides available.</Card>}
      <div className="artifact-slideshow-strip">
        {slides.map((slide, index) => (
          <button key={index} className={index === activeSlide ? 'is-active' : ''} onClick={() => setActiveSlide(index)}>
            <span>{index + 1}</span>
            {slide.title || 'Untitled'}
          </button>
        ))}
      </div>
    </Drawer>
  </Drawer>;
};

export default ArtifactEditorModal;
