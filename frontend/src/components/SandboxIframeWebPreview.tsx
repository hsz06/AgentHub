import React, { useEffect, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';

interface SandboxIframeWebPreviewProps {
  url?: string;
  htmlContent?: string;
  height?: number;
}

const SandboxIframeWebPreview: React.FC<SandboxIframeWebPreviewProps> = ({
  url,
  htmlContent,
  height = 320,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (iframeRef.current && htmlContent) {
      try {
        const doc = iframeRef.current.contentDocument;
        if (doc) {
          doc.open();
          doc.write(htmlContent);
          doc.close();
        }
        setLoading(false);
      } catch (e) {
        setError('无法加载内容，可能存在安全限制');
        setLoading(false);
      }
    }
  }, [htmlContent]);

  const handleIframeLoad = () => {
    setLoading(false);
  };

  if (!url && !htmlContent) {
    return (
      <Alert
        message="预览内容不存在"
        description="没有提供有效的URL或HTML内容"
        type="warning"
        showIcon
      />
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', borderRadius: 8 }}>
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f7f8fa',
            zIndex: 1,
          }}
        >
          <Spin size="large" tip="正在加载预览..." />
        </div>
      )}
      {error && (
        <Alert
          message="安全限制"
          description={error}
          type="error"
          showIcon
          style={{ margin: 0, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}
        />
      )}
      <iframe
        ref={iframeRef}
        src={url}
        onLoad={handleIframeLoad}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        style={{
          width: '100%',
          height: '100%',
          border: '1px solid #e8e8e8',
          borderRadius: 8,
        }}
        title="Web Preview"
        referrerPolicy="no-referrer"
        loading="lazy"
      />
    </div>
  );
};

export default SandboxIframeWebPreview;
