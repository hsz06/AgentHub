import { Card, Typography, Button, Space } from 'antd';
import { FileOutlined, DownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface FileAttachmentCardProps {
  fileName: string;
  fileSize?: string;
  fileType?: string;
  onDownload?: () => void;
}

const FileAttachmentCard: React.FC<FileAttachmentCardProps> = ({ 
  fileName, 
  fileSize, 
  fileType = '通用文件', 
  onDownload 
}) => {
  return (
    <Card
      size="small"
      style={{ width: 300, borderRadius: 12, backgroundColor: '#f8fafc' }}
      bodyStyle={{ padding: 16 }}
    >
      <Space style={{ width: '100%' }} direction="vertical" size={12}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ 
            width: 48, 
            height: 48, 
            borderRadius: 10, 
            backgroundColor: '#e6f7ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ fontSize: 14, display: 'block' }}>{fileName}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {fileType}{fileSize ? ` · ${fileSize}` : ''}
            </Text>
          </div>
        </div>
        <Button 
          type="primary" 
          ghost 
          size="small" 
          icon={<DownloadOutlined />}
          onClick={onDownload}
          block
        >
          下载文件
        </Button>
      </Space>
    </Card>
  );
};

export default FileAttachmentCard;
