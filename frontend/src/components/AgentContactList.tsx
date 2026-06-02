import { useEffect, useState } from 'react';
import { Avatar, Button, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { Agent } from '../types';
import { agentsApi } from '../services';

const { TextArea } = Input;

interface Props {
  onSelectAgent?: (agent: Agent) => void;
  selectedAgentId?: string;
}

function parseList(value?: string | string[]) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]') as string[]; } catch { return []; }
}

const AgentContactList: React.FC<Props> = ({ onSelectAgent, selectedAgentId }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const load = async () => setAgents(await agentsApi.getAgents());
  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ adapterType: 'mimo', model: 'mimo-v2.5-pro', tools: ['read_workspace_file', 'propose_file_change'] });
    setVisible(true);
  };

  const openEdit = (agent: Agent, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditing(agent);
    form.setFieldsValue({ ...agent, capabilities: parseList(agent.capabilities), tools: parseList(agent.tools) });
    setVisible(true);
  };

  const save = async (values: any) => {
    setLoading(true);
    try {
      if (editing) await agentsApi.updateAgent(editing.id, values);
      else await agentsApi.createAgent(values);
      message.success('Agent saved');
      setVisible(false);
      await load();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
      <strong>Agents</strong>
      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>New</Button>
    </div>
    {agents.length === 0 ? <Empty style={{ padding: 40 }} /> : <List dataSource={agents} renderItem={agent => (
      <List.Item
        onClick={() => onSelectAgent?.(agent)}
        style={{ padding: '12px 16px', cursor: 'pointer', background: selectedAgentId === agent.id ? '#e6f7ff' : undefined }}
        actions={agent.isBuiltin ? [] : [
          <Button key="edit" type="text" icon={<EditOutlined />} onClick={event => openEdit(agent, event)} />,
          <Popconfirm key="delete" title="Delete this Agent?" onConfirm={async () => { await agentsApi.deleteAgent(agent.id); await load(); }}>
            <Button type="text" danger icon={<DeleteOutlined />} onClick={event => event.stopPropagation()} />
          </Popconfirm>,
        ]}
      >
        <List.Item.Meta
          avatar={<Avatar icon={<RobotOutlined />} style={{ background: agent.adapterType === 'claude' ? '#8B5CF6' : agent.adapterType === 'mimo' ? '#F59E0B' : '#10B981' }} />}
          title={<Space>{agent.name}{agent.isBuiltin && <Tag color="green">Built-in</Tag>}<Tag>{agent.adapterType}</Tag></Space>}
          description={<><div>{agent.description || 'No description'}</div>{parseList(agent.capabilities).map(item => <Tag key={item}>{item}</Tag>)}</>}
        />
      </List.Item>
    )} />}
    <Modal title={editing ? 'Edit Agent' : 'Create Agent'} open={visible} onCancel={() => setVisible(false)} footer={null}>
      <Form form={form} layout="vertical" onFinish={save}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="adapterType" label="Provider" rules={[{ required: true }]}>
          <Select options={[
            { value: 'openai', label: 'OpenAI' },
            { value: 'claude', label: 'Anthropic' },
            { value: 'mimo', label: 'MiMo (OpenAI-compatible)' },
            { value: 'claude-code-cli', label: 'Claude Code CLI' },
            { value: 'codex-cli', label: 'Codex CLI' },
            { value: 'opencode-cli', label: 'OpenCode CLI' },
          ]} />
        </Form.Item>
        <Form.Item name="model" label="Model"><Input placeholder="mimo-v2.5-pro" /></Form.Item>
        <Form.Item name="description" label="Description"><TextArea rows={2} /></Form.Item>
        <Form.Item name="capabilities" label="Capabilities"><Select mode="tags" /></Form.Item>
        <Form.Item name="tools" label="Tool permissions">
          <Select mode="multiple" options={[
            { value: 'list_workspace_files', label: 'List workspace files' },
            { value: 'read_workspace_file', label: 'Read workspace file' },
            { value: 'propose_file_change', label: 'Propose file change' },
            { value: 'propose_command', label: 'Propose command' },
            { value: 'propose_deployment', label: 'Propose deployment' },
          ]} />
        </Form.Item>
        <Form.Item name="systemPrompt" label="System prompt"><TextArea rows={5} /></Form.Item>
        <Button loading={loading} type="primary" htmlType="submit">Save</Button>
      </Form>
    </Modal>
  </div>;
};

export default AgentContactList;
