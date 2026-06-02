import React from 'react';
import PreviewCard from './PreviewCard';

interface CodeDiffCardProps {
  oldCode: string;
  newCode: string;
  language?: string;
  fileName?: string;
  onFullScreen?: () => void;
}

const CodeDiffCard: React.FC<CodeDiffCardProps> = ({
  oldCode,
  newCode,
  language = 'typescript',
  fileName = 'untitled.ts',
  onFullScreen,
}) => {
  const generateDiffLines = (oldLines: string[], newLines: string[]) => {
    const result: {
      type: 'unchanged' | 'added' | 'removed' | 'empty';
      content: string;
      oldLineNum?: number;
      newLineNum?: number;
    }[] = [];

    let i = 0, j = 0;
    
    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        result.push({
          type: 'added',
          content: newLines[j],
          newLineNum: j + 1,
        });
        j++;
      } else if (j >= newLines.length) {
        result.push({
          type: 'removed',
          content: oldLines[i],
          oldLineNum: i + 1,
        });
        i++;
      } else if (oldLines[i] === newLines[j]) {
        result.push({
          type: 'unchanged',
          content: oldLines[i],
          oldLineNum: i + 1,
          newLineNum: j + 1,
        });
        i++;
        j++;
      } else {
        const oldSubsequentMatch = newLines.slice(j).indexOf(oldLines[i]);
        const newSubsequentMatch = oldLines.slice(i).indexOf(newLines[j]);
        
        if (oldSubsequentMatch !== -1 && (newSubsequentMatch === -1 || oldSubsequentMatch < newSubsequentMatch)) {
          result.push({
            type: 'removed',
            content: oldLines[i],
            oldLineNum: i + 1,
          });
          i++;
        } else if (newSubsequentMatch !== -1) {
          result.push({
            type: 'added',
            content: newLines[j],
            newLineNum: j + 1,
          });
          j++;
        } else {
          result.push({
            type: 'removed',
            content: oldLines[i],
            oldLineNum: i + 1,
          });
          result.push({
            type: 'added',
            content: newLines[j],
            newLineNum: j + 1,
          });
          i++;
          j++;
        }
      }
    }
    return result;
  };

  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');
  const diffLines = generateDiffLines(oldLines, newLines);

  const renderDiffContent = () => {
    return (
      <div
        style={{
          maxHeight: 360,
          overflow: 'auto',
          borderRadius: 8,
          backgroundColor: '#1e1e1e',
        }}
      >
        <div style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: 13 }}>
          {diffLines.map((line, idx) => {
            let bgColor = 'transparent';
            let prefix = ' ';
            if (line.type === 'added') {
              bgColor = 'rgba(48, 209, 88, 0.2)';
              prefix = '+';
            } else if (line.type === 'removed') {
              bgColor = 'rgba(255, 77, 79, 0.2)';
              prefix = '-';
            }
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  backgroundColor: bgColor,
                  lineHeight: '20px',
                }}
              >
                <span
                  style={{
                    minWidth: 50,
                    padding: '0 8px',
                    textAlign: 'right',
                    color: '#858585',
                    userSelect: 'none',
                    borderRight: '1px solid #3a3a3a',
                    flexShrink: 0,
                  }}
                >
                  {line.oldLineNum || ''}
                </span>
                <span
                  style={{
                    minWidth: 50,
                    padding: '0 8px',
                    textAlign: 'right',
                    color: '#858585',
                    userSelect: 'none',
                    borderRight: '1px solid #3a3a3a',
                    flexShrink: 0,
                  }}
                >
                  {line.newLineNum || ''}
                </span>
                <span
                  style={{
                    padding: '0 8px',
                    color: line.type === 'added' ? '#30d158' : line.type === 'removed' ? '#ff4d4f' : '#d4d4d4',
                    whiteSpace: 'pre',
                    flex: 1,
                  }}
                >
                  {prefix} {line.content}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <PreviewCard
      title={`代码变更 - ${fileName}`}
      description={`显示差异对比 · ${language.toUpperCase()}`}
      onFullScreen={onFullScreen}
    >
      {renderDiffContent()}
    </PreviewCard>
  );
};

export default CodeDiffCard;
