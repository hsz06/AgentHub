import React, { useMemo, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const safeHtml = useMemo(() => htmlContent ? `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'">
${htmlContent}` : undefined, [htmlContent]);

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
      <iframe
        src={url}
        srcDoc={safeHtml}
        onLoad={handleIframeLoad}
        sandbox="allow-scripts"
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
