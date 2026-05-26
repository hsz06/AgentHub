import React from 'react';
import { Modal, Typography } from 'antd';
import SandboxIframeWebPreview from './SandboxIframeWebPreview';
import CodeDiffCard from './CodeDiffCard';
import { PreviewCardType, WebPreviewData, CodeDiffData } from '../types';

const { Title } = Typography;

interface FullPreviewModalProps {
  visible: boolean;
  title: string;
  type: PreviewCardType;
  data: WebPreviewData | CodeDiffData;
  onClose: () => void;
}

const FullPreviewModal: React.FC<FullPreviewModalProps> = ({
  visible,
  title,
  type,
  data,
  onClose,
}) => {
  const renderContent = () => {
    if (type === 'web-preview') {
      const webData = data as WebPreviewData;
      return (
        <SandboxIframeWebPreview
          url={webData.url}
          htmlContent={webData.htmlContent}
          height={600}
        />
      );
    }
    if (type === 'code-diff') {
      const diffData = data as CodeDiffData;
      return (
        <div
          style={{
            maxHeight: 600,
            overflow: 'auto',
            borderRadius: 8,
            backgroundColor: '#1e1e1e',
          }}
        >
          <div style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: 13 }}>
            {(() => {
              const oldLines = diffData.oldCode.split('\n');
              const newLines = diffData.newCode.split('\n');
              const result: {
                type: 'unchanged' | 'added' | 'removed' | 'empty';
                content: string;
                oldLineNum?: number;
                newLineNum?: number;
              }[] = [];
              let i = 0, j = 0;
              while (i < oldLines.length || j < newLines.length) {
                if (i >= oldLines.length) {
                  result.push({ type: 'added', content: newLines[j], newLineNum: j + 1 });
                  j++;
                } else if (j >= newLines.length) {
                  result.push({ type: 'removed', content: oldLines[i], oldLineNum: i + 1 });
                  i++;
                } else if (oldLines[i] === newLines[j]) {
                  result.push({ type: 'unchanged', content: oldLines[i], oldLineNum: i + 1, newLineNum: j + 1 });
                  i++; j++;
                } else {
                  const oldSubsequentMatch = newLines.slice(j).indexOf(oldLines[i]);
                  const newSubsequentMatch = oldLines.slice(i).indexOf(newLines[j]);
                  if (oldSubsequentMatch !== -1 && (newSubsequentMatch === -1 || oldSubsequentMatch < newSubsequentMatch)) {
                    result.push({ type: 'removed', content: oldLines[i], oldLineNum: i + 1 });
                    i++;
                  } else if (newSubsequentMatch !== -1) {
                    result.push({ type: 'added', content: newLines[j], newLineNum: j + 1 });
                    j++;
                  } else {
                    result.push({ type: 'removed', content: oldLines[i], oldLineNum: i + 1 });
                    result.push({ type: 'added', content: newLines[j], newLineNum: j + 1 });
                    i++; j++;
                  }
                }
              }
              return result.map((line, idx) => {
                let bgColor = 'transparent';
                let prefix = ' ';
                if (line.type === 'added') { bgColor = 'rgba(48, 209, 88, 0.2)'; prefix = '+'; }
                else if (line.type === 'removed') { bgColor = 'rgba(255, 77, 79, 0.2)'; prefix = '-'; }
                return (
                  <div key={idx} style={{ display: 'flex', backgroundColor: bgColor, lineHeight: '22px' }}>
                    <span style={{ minWidth: 60, padding: '0 10px', textAlign: 'right', color: '#858585', userSelect: 'none', borderRight: '1px solid #3a3a3a', flexShrink: 0 }}>{line.oldLineNum || ''}</span>
                    <span style={{ minWidth: 60, padding: '0 10px', textAlign: 'right', color: '#858585', userSelect: 'none', borderRight: '1px solid #3a3a3a', flexShrink: 0 }}>{line.newLineNum || ''}</span>
                    <span style={{ padding: '0 10px', color: line.type === 'added' ? '#30d158' : line.type === 'removed' ? '#ff4d4f' : '#d4d4d4', whiteSpace: 'pre', flex: 1 }}>{prefix} {line.content}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Modal
      open={visible}
      title={
        <Title level={4} style={{ margin: 0 }}>
          {title}
        </Title>
      }
      onCancel={onClose}
      footer={null}
      width="90%"
      style={{ top: 20 }}
      bodyStyle={{ padding: 16, borderRadius: 12 }}
      destroyOnClose
    >
      {renderContent()}
    </Modal>
  );
};

export default FullPreviewModal;
