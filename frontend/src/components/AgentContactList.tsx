import { useEffect, useMemo, useState } from 'react';
import { Alert, AutoComplete, Button, Empty, Form, Input, Popconfirm, Select, Space, Tag, message } from 'antd';
import { DeleteOutlined, ExperimentOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { Agent } from '../types';
import { agentsApi, settingsApi } from '../services';

const { TextArea } = Input;

interface Props {
  onSelectAgent?: (agent: Agent) => void;
  selectedAgentId?: string;
  onChanged?: (agents: Agent[]) => void;
}

const DEFAULT_AGENT = {
  adapterType: 'mimo',
  tools: ['read_workspace_file', 'propose_file_change'],
  capabilities: ['workspace', 'code'],
};

type ProviderConfig = {
  providerType: 'openai' | 'anthropic' | 'mimo';
  displayName: string;
  baseURL?: string | null;
  defaultModel: string;
  configured: boolean;
};

function parseList(value?: string | string[]) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]') as string[]; } catch { return []; }
}

function classifyAdapter(adapter?: string | null): 'claude' | 'codex' | 'opencode' | 'orchestrator' | 'user' {
  const value = String(adapter || '').toLowerCase();
  if (value.includes('claude')) return 'claude';
  if (value.includes('codex')) return 'codex';
  if (value.includes('opencode')) return 'opencode';
  if (value.includes('mimo') || value.includes('orchestrator')) return 'orchestrator';
  return 'user';
}

function providerLabel(agent: Partial<Agent>) {
  if (agent.adapterType === 'claude-code-cli') return 'Claude Code CLI';
  if (agent.adapterType === 'codex-cli') return 'Codex CLI';
  if (agent.adapterType === 'opencode-cli') return 'OpenCode CLI';
  if (agent.adapterType === 'claude') return 'Anthropic';
  if (agent.adapterType === 'openai') return 'OpenAI';
  return 'MiMo';
}

function testTarget(adapterType?: string) {
  if (adapterType === 'openai') return { kind: 'provider' as const, value: 'openai' as const };
  if (adapterType === 'claude') return { kind: 'provider' as const, value: 'anthropic' as const };
  if (adapterType === 'mimo') return { kind: 'provider' as const, value: 'mimo' as const };
  if (adapterType === 'claude-code-cli') return { kind: 'runtime' as const, value: 'claude-code' as const };
  if (adapterType === 'codex-cli') return { kind: 'runtime' as const, value: 'codex' as const };
  if (adapterType === 'opencode-cli') return { kind: 'runtime' as const, value: 'opencode' as const };
  return null;
}

function providerForAdapter(adapterType?: string): ProviderConfig['providerType'] | null {
  if (adapterType === 'openai') return 'openai';
  if (adapterType === 'claude') return 'anthropic';
  if (adapterType === 'mimo') return 'mimo';
  return null;
}

const AgentContactList: React.FC<Props> = ({ onSelectAgent, selectedAgentId, onChanged }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();
  const adapterType = Form.useWatch('adapterType', form);
  const providerType = providerForAdapter(adapterType);
  const providerConfig = providers.find(item => item.providerType === providerType);
  const modelOptions = providers
    .map(item => item.defaultModel)
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .map(value => ({ value }));

  const load = async () => {
    const [rows, providerRows] = await Promise.all([agentsApi.getAgents(), settingsApi.providers()]);
    setAgents(rows);
    setProviders(providerRows);
    onChanged?.(rows);
    if (!selected && !creating && rows[0]) selectAgent(rows[0], rows);
    return rows;
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const cli = agents.filter(agent => agent.adapterType.endsWith('-cli'));
    const custom = agents.filter(agent => !agent.isBuiltin && !agent.adapterType.endsWith('-cli'));
    const builtin = agents.filter(agent => agent.isBuiltin && !agent.adapterType.endsWith('-cli'));
    return [
      { key: 'cli', title: 'CLI Runtime', items: cli },
      { key: 'custom', title: '自定义 Agent', items: custom },
      { key: 'builtin', title: '内置 Agent', items: builtin },
    ].filter(group => group.items.length > 0);
  }, [agents]);

  function selectAgent(agent: Agent, source = agents) {
    const current = source.find(item => item.id === agent.id) || agent;
    setSelected(current);
    setCreating(false);
    form.setFieldsValue({
      name: current.name,
      adapterType: current.adapterType,
      model: current.model || '',
      description: current.description,
      capabilities: parseList(current.capabilities),
      tools: parseList(current.tools),
      systemPrompt: current.systemPrompt,
    });
    onSelectAgent?.(current);
  }

  const openCreate = () => {
    setSelected(null);
    setCreating(true);
    form.resetFields();
    const defaultProvider = providers.find(item => item.providerType === DEFAULT_AGENT.adapterType);
    form.setFieldsValue({ ...DEFAULT_AGENT, model: defaultProvider?.defaultModel || '' });
  };

  const save = async () => {
    if (selected?.isBuiltin) {
      message.info('内置 Agent 为只读配置，请新建自定义 Agent。');
      return;
    }
    const values = await form.validateFields();
    const payload = { ...values, model: values.model?.trim() || null };
    setLoading(true);
    try {
      const saved = selected ? await agentsApi.updateAgent(selected.id, payload) : await agentsApi.createAgent(payload);
      message.success(selected ? 'Agent 配置已更新' : '自定义 Agent 已创建');
      setCreating(false);
      const rows = await load();
      selectAgent(saved, rows);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!selected || selected.isBuiltin) return;
    await agentsApi.deleteAgent(selected.id);
    message.success('Agent 已删除');
    setSelected(null);
    setCreating(false);
    form.resetFields();
    await load();
  };

  const testConfig = async () => {
    const target = testTarget(adapterType);
    if (!target) return message.warning('请选择 Agent Provider。');
    setTesting(true);
    try {
      if (target.kind === 'provider') {
        const result = await settingsApi.testProvider(target.value);
        message.success(`${providerLabel({ adapterType })} 可用：${result.model}`);
      } else {
        const result = await settingsApi.testCliRuntime(target.value);
        message.success(result.output || `${providerLabel({ adapterType })} 可执行`);
      }
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setTesting(false);
    }
  };

  const readOnly = Boolean(selected?.isBuiltin && !creating);

  return (
    <div className="agent-config-workbench">
      <aside className="agent-config-list">
        <div className="agent-config-list-head">
          <div>
            <span className="kicker">AGENT DIRECTORY</span>
            <strong>{agents.length} 个 Agent</strong>
          </div>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>新建</Button>
        </div>
        <div className="agent-config-list-scroll">
          {agents.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Agent" /> : grouped.map(group => (
            <section key={group.key} className="agent-config-group">
              <h4>{group.title}</h4>
              {group.items.map(agent => {
                const kind = classifyAdapter(agent.adapterType);
                const active = selectedAgentId === agent.id || selected?.id === agent.id;
                return (
                  <button key={agent.id} className={`agent-config-row ${active ? 'is-active' : ''}`} onClick={() => selectAgent(agent)}>
                    <span className={`av av--sm av--${kind}`}>{agent.name[0]?.toUpperCase()}</span>
                    <span className="agent-config-row-main">
                      <strong>{agent.name}</strong>
                      <em>{providerLabel(agent)} · {agent.model || '默认模型'}</em>
                    </span>
                    {agent.isBuiltin ? <Tag>内置</Tag> : <Tag color="gold">自定义</Tag>}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </aside>

      <section className="agent-config-editor">
        <header className="agent-config-editor-head">
          <div>
            <span className="kicker">{creating ? 'CREATE AGENT' : selected ? 'CONFIGURE AGENT' : 'NO AGENT SELECTED'}</span>
            <h3>{creating ? '新建自定义 Agent' : selected?.name || '选择或新建 Agent'}</h3>
          </div>
          <Space>
            {selected?.isBuiltin && <Tag>只读</Tag>}
            {selected && !selected.isBuiltin && !creating && (
              <Popconfirm title="删除这个 Agent？" onConfirm={remove}>
                <Button danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            )}
          </Space>
        </header>

        <div className="agent-config-form-scroll">
          <Form form={form} layout="vertical" disabled={readOnly}>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入 Agent 名称' }]}><Input placeholder="例如：前端审查员" /></Form.Item>
            <Form.Item name="adapterType" label="Provider" rules={[{ required: true, message: '请选择 Provider' }]}>
              <Select onChange={(nextAdapter: string) => {
                const nextProvider = providerForAdapter(nextAdapter);
                const nextDefault = providers.find(item => item.providerType === nextProvider)?.defaultModel || '';
                form.setFieldValue('model', nextDefault);
              }} options={[
                { value: 'mimo', label: 'MiMo (OpenAI-compatible)' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'claude', label: 'Anthropic' },
                { value: 'claude-code-cli', label: 'Claude Code CLI' },
                { value: 'codex-cli', label: 'Codex CLI' },
                { value: 'opencode-cli', label: 'OpenCode CLI' },
              ]} />
            </Form.Item>
            {providerType && (
              <Alert
                className="agent-provider-alert"
                type={providerConfig?.configured ? 'success' : 'warning'}
                showIcon
                message={`${providerConfig?.displayName || providerLabel({ adapterType })} ${providerConfig?.configured ? '已配置' : '未配置 API Key'}`}
                description={`默认模型：${providerConfig?.defaultModel || '未设置'}。Agent 模型留空时会使用模型服务中的默认模型。`}
              />
            )}
            <Form.Item name="model" label="Agent 模型">
              <AutoComplete options={modelOptions} placeholder={providerConfig?.defaultModel || '留空使用模型服务默认模型'} />
            </Form.Item>
            <Form.Item name="description" label="描述"><TextArea rows={3} placeholder="这个 Agent 擅长什么？" /></Form.Item>
            <Form.Item name="capabilities" label="能力标签"><Select mode="tags" placeholder="code-review / frontend / docs" /></Form.Item>
            <Form.Item name="tools" label="工具权限">
              <Select mode="multiple" options={[
                { value: 'list_workspace_files', label: 'List workspace files' },
                { value: 'read_workspace_file', label: 'Read workspace file' },
                { value: 'propose_file_change', label: 'Propose file change' },
                { value: 'propose_command', label: 'Propose command' },
                { value: 'propose_deployment', label: 'Propose deployment' },
              ]} />
            </Form.Item>
            <Form.Item name="systemPrompt" label="System Prompt"><TextArea rows={8} placeholder="定义角色、边界、输出格式和工具使用规则。" /></Form.Item>
          </Form>
        </div>

        <footer className="agent-config-actions">
          <Button icon={<ExperimentOutlined />} loading={testing} onClick={testConfig}>测试配置</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={loading} disabled={readOnly} onClick={save}>
            {creating ? '创建 Agent' : '保存配置'}
          </Button>
        </footer>
      </section>
    </div>
  );
};

export default AgentContactList;
