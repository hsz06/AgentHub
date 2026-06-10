import { Button } from 'antd';
import { ExpandOutlined } from '@ant-design/icons';
import React from 'react';

interface PreviewCardProps {
  title: string;
  description?: string;
  kicker?: string;
  children: React.ReactNode;
  onFullScreen?: () => void;
  headerExtra?: React.ReactNode;
}

const PreviewCard: React.FC<PreviewCardProps> = ({
  title,
  description,
  kicker = 'ARTIFACT',
  children,
  onFullScreen,
  headerExtra,
}) => {
  return (
    <section className="artifact-preview-card">
      <header style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--canvas-rule-soft)',
        background: 'var(--canvas)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div className="kicker" style={{ display: 'block', marginBottom: 4, color: 'var(--ink-faint)' }}>
            {kicker}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{title}</div>
          {description && (
            <div style={{
              marginTop: 3,
              fontSize: 12.5,
              color: 'var(--ink-soft)',
              lineHeight: 1.5,
            }}>{description}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {headerExtra}
          {onFullScreen && (
            <Button
              type="text"
              size="small"
              icon={<ExpandOutlined />}
              onClick={onFullScreen}
              style={{
                color: 'var(--ink-muted)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              展开
            </Button>
          )}
        </div>
      </header>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
};

export default PreviewCard;
