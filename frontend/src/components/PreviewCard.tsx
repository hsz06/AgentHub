import { Card, Typography, Button } from 'antd';
import { ExpandOutlined } from '@ant-design/icons';
import React from 'react';

const { Title, Text } = Typography;

interface PreviewCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  onFullScreen?: () => void;
  headerExtra?: React.ReactNode;
}

const PreviewCard: React.FC<PreviewCardProps> = ({
  title,
  description,
  children,
  onFullScreen,
  headerExtra,
}) => {
  return (
    <Card
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #e8e8e8',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        transition: 'all 0.3s ease',
      }}
      bodyStyle={{ padding: 0 }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Title level={5} style={{ margin: 0, fontSize: 14 }}>
            {title}
          </Title>
          {description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {description}
            </Text>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {headerExtra}
          {onFullScreen && (
            <Button
              type="text"
              size="small"
              icon={<ExpandOutlined />}
              onClick={onFullScreen}
              style={{ color: '#666' }}
            >
              全屏
            </Button>
          )}
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </Card>
  );
};

export default PreviewCard;
