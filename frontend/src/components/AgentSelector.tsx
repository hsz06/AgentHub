import React from 'react';
import { Avatar, Card, Tag, Space } from 'antd';
import { CodeOutlined, RobotOutlined, ThunderboltOutlined, CheckOutlined } from '@ant-design/icons';
import { Agent } from '../types';

const IconMap: Record<string, React.FC<any>> = {
  'CodeOutlined': CodeOutlined,
  'RobotOutlined': RobotOutlined,
  'ThunderboltOutlined': ThunderboltOutlined,
};

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onClick?: () => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, selected, onClick }) => {
  const IconComponent = IconMap[agent.iconType] || CodeOutlined;
  
  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        border: selected ? `2px solid ${agent.color}` : '1px solid #f0f0f5',
        borderRadius: 12,
        cursor: 'pointer',
        backgroundColor: selected ? `${agent.color}08` : '#fff',
      }}
      bodyStyle={{ padding: 16 }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            size={48}
            style={{
              backgroundColor: agent.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            icon={<IconComponent style={{ fontSize: 24 }} />}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              {agent.name}
              {selected && <CheckOutlined style={{ color: agent.color }} />}
            </div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
              {agent.description}
            </div>
          </div>
        </div>
        <Space wrap size={[6, 6]}>
          {agent.tags.map((tag, idx) => (
            <Tag
              key={idx}
              color={agent.color}
              style={{
                margin: 0,
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              {tag}
            </Tag>
          ))}
        </Space>
      </Space>
    </Card>
  );
};

interface AgentSelectorProps {
  agents: Agent[];
  selectedAgentIds?: string[];
  onSelectAgent?: (agentId: string) => void;
  mode?: 'single' | 'multiple';
}

const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  selectedAgentIds = [],
  onSelectAgent,
  mode = 'single',
}) => {
  const handleAgentClick = (agentId: string) => {
    onSelectAgent?.(agentId);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          selected={selectedAgentIds.includes(agent.id)}
          onClick={() => handleAgentClick(agent.id)}
        />
      ))}
    </div>
  );
};

export default AgentSelector;
