import { Modal, Tabs, Button, Space } from 'antd';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import { Agent } from '../types';
import AgentSelector from './AgentSelector';

interface NewSessionModalProps {
  visible: boolean;
  agents: Agent[];
  selectedAgentIds: string[];
  onSelectAgents: (agentIds: string[]) => void;
  onCreateSession: (type: 'single' | 'group') => void;
  onCancel: () => void;
}

const NewSessionModal: React.FC<NewSessionModalProps> = ({
  visible,
  agents,
  selectedAgentIds,
  onSelectAgents,
  onCreateSession,
  onCancel,
}) => {
  const handleSelectAgent = (agentId: string, mode: 'single' | 'group') => {
    if (mode === 'single') {
      onSelectAgents([agentId]);
    } else {
      if (selectedAgentIds.includes(agentId)) {
        onSelectAgents(selectedAgentIds.filter((id) => id !== agentId));
      } else {
        onSelectAgents([...selectedAgentIds, agentId]);
      }
    }
  };

  return (
    <Modal
      title="新建会话"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={640}
      style={{ top: 80 }}
    >
      <Tabs
        defaultActiveKey="single"
        items={[
          {
            key: 'single',
            label: (
              <span>
                <UserOutlined />
                &nbsp;单聊
              </span>
            ),
            children: (
              <div style={{ paddingTop: 16 }}>
                <p style={{ marginBottom: 16, fontSize: 14, color: '#666' }}>
                  选择一个Agent开始一对一对话
                </p>
                <AgentSelector
                  agents={agents}
                  selectedAgentIds={selectedAgentIds}
                  mode="single"
                  onSelectAgent={(id) => handleSelectAgent(id, 'single')}
                />
                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <Space>
                    <Button onClick={onCancel}>取消</Button>
                    <Button
                      type="primary"
                      onClick={() => onCreateSession('single')}
                      disabled={selectedAgentIds.length !== 1}
                    >
                      创建单聊
                    </Button>
                  </Space>
                </div>
              </div>
            ),
          },
          {
            key: 'group',
            label: (
              <span>
                <TeamOutlined />
                &nbsp;群聊
              </span>
            ),
            children: (
              <div style={{ paddingTop: 16 }}>
                <p style={{ marginBottom: 16, fontSize: 14, color: '#666' }}>
                  选择多个Agent，让他们协作完成任务（至少选择2个）
                </p>
                <AgentSelector
                  agents={agents}
                  selectedAgentIds={selectedAgentIds}
                  mode="multiple"
                  onSelectAgent={(id) => handleSelectAgent(id, 'group')}
                />
                {selectedAgentIds.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: '12px 16px',
                      backgroundColor: '#f7f8fa',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#666' }}>
                      已选择 {selectedAgentIds.length} 个Agent：
                      {agents
                        .filter((a) => selectedAgentIds.includes(a.id))
                        .map((a) => a.name)
                        .join('、')}
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <Space>
                    <Button onClick={onCancel}>取消</Button>
                    <Button
                      type="primary"
                      onClick={() => onCreateSession('group')}
                      disabled={selectedAgentIds.length < 2}
                    >
                      创建群聊
                    </Button>
                  </Space>
                </div>
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default NewSessionModal;
