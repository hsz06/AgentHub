import { Card, Typography, Progress, Space, Tag, Button } from 'antd';
import { RocketOutlined, CheckCircleOutlined, LoadingOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'success' | 'failed';

interface DeploymentStatusCardProps {
  deployName: string;
  status: DeploymentStatus;
  progress?: number;
  deployUrl?: string;
  errorMsg?: string;
  onVisit?: () => void;
  onRedeploy?: () => void;
}

const statusConfig: Record<DeploymentStatus, { icon: React.ReactNode; color: string; text: string }> = {
  pending: { icon: <LoadingOutlined spin />, color: '#faad14', text: '等待部署' },
  building: { icon: <LoadingOutlined spin />, color: '#1890ff', text: '构建中' },
  deploying: { icon: <RocketOutlined />, color: '#722ed1', text: '部署中' },
  success: { icon: <CheckCircleOutlined />, color: '#52c41a', text: '部署成功' },
  failed: { icon: <ExclamationCircleOutlined />, color: '#ff4d4f', text: '部署失败' },
};

const DeploymentStatusCard: React.FC<DeploymentStatusCardProps> = ({
  deployName,
  status,
  progress = 0,
  deployUrl,
  errorMsg,
  onVisit,
  onRedeploy,
}) => {
  const cfg = statusConfig[status];

  return (
    <Card
      size="small"
      style={{ width: 340, borderRadius: 12, borderLeft: `4px solid ${cfg.color}` }}
      bodyStyle={{ padding: 16 }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: cfg.color, fontSize: 20 }}>{cfg.icon}</span>
            <Text strong style={{ fontSize: 15 }}>{deployName}</Text>
          </div>
          <Tag color={cfg.color}>{cfg.text}</Tag>
        </div>

        {status === 'building' || status === 'deploying' ? (
          <Progress percent={progress} status="active" strokeColor={cfg.color} />
        ) : null}

        {status === 'success' && deployUrl ? (
          <Button type="primary" size="small" onClick={onVisit} block>
            访问部署站点
          </Button>
        ) : null}

        {status === 'failed' && errorMsg ? (
          <Text type="danger" style={{ fontSize: 12 }}>
            错误：{errorMsg}
          </Text>
        ) : null}

        {status === 'failed' && onRedeploy ? (
          <Button size="small" onClick={onRedeploy} block>
            重新部署
          </Button>
        ) : null}
      </Space>
    </Card>
  );
};

export default DeploymentStatusCard;
