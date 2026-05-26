import { Card, Image, Typography } from 'antd';
import { FullscreenOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ImagePreviewCardProps {
  imageUrl: string;
  title?: string;
  onFullScreen?: () => void;
}

const ImagePreviewCard: React.FC<ImagePreviewCardProps> = ({ imageUrl, title, onFullScreen }) => {
  return (
    <Card
      size="small"
      style={{ width: 320, borderRadius: 12, overflow: 'hidden' }}
      bodyStyle={{ padding: 12 }}
      extra={
        onFullScreen ? (
          <FullscreenOutlined
            onClick={onFullScreen}
            style={{ fontSize: 14, color: '#667eea', cursor: 'pointer' }}
          />
        ) : undefined
      }
    >
      {title && (
        <div style={{ marginBottom: 8 }}>
          <Text strong style={{ fontSize: 14 }}>{title}</Text>
        </div>
      )}
      <Image
        src={imageUrl}
        style={{ width: '100%', borderRadius: 8 }}
        preview
      />
    </Card>
  );
};

export default ImagePreviewCard;
