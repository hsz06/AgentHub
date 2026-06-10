import { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Form, Input, List, Modal, Select, Space, Switch, Tabs, Tag, Typography, Upload, message } from 'antd';
import { agentRunsApi, agentsApi, approvalsApi, artifactsApi, deploymentsApi, settingsApi, workspacesApi } from '../services';
import ArtifactEditorModal from './ArtifactEditorModal';

interface Props {
  open: boolean;
  onClose: () => void;
  currentConversationId?: string | null;
  initialTab?: string;
  onApprovalsChanged?: () => void;
}

const { Text, Paragraph } = Typography;
const WORKSPACE_COMMANDS = ['npm install', 'npm run build', 'npm test', 'npm run test', 'npm run lint'];
const ACTIVE_RUN_STATUSES = ['queued', 'running', 'cancelling'];

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseApprovalPayload(approval: any) {
  try {
    return typeof approval.payload === 'string' ? JSON.parse(approval.payload || '{}') : approval.payload || {};
  } catch {
    return {};
  }
}

function approvalPreview(approval: any) {
  const payload = parseApprovalPayload(approval);
  if (approval.type === 'apply_diff') {
    const content = String(payload.content || '');
    const oldContent = payload.oldContent === undefined ? null : String(payload.oldContent || '');
    return (
      <div className="approval-preview">
        <div><span>FILE</span><Text code>{payload.filePath || 'unknown'}</Text></div>
        {oldContent !== null ? (
          <div className="approval-diff-grid">
            <section>
              <strong>BEFORE</strong>
              <pre>{oldContent ? oldContent.slice(0, 900) : 'Empty file.'}</pre>
            </section>
            <section>
              <strong>AFTER</strong>
              <pre>{content ? content.slice(0, 900) : 'No file content included.'}</pre>
            </section>
          </div>
        ) : (
          <pre>{content ? content.slice(0, 1200) : 'No file content included.'}</pre>
        )}
      </div>
    );
  }
  if (approval.type === 'run_command') {
    return (
      <div className="approval-preview">
        <div><span>COMMAND</span><Text code>{payload.command || 'unknown'}</Text></div>
        {approval.workspace?.name && <div><span>WORKSPACE</span><Text>{approval.workspace.name}</Text></div>}
        {approval.result && (
          <section className="approval-result-log">
            <strong>RESULT</strong>
            <pre>{String(approval.result).slice(0, 8000)}</pre>
          </section>
        )}
      </div>
    );
  }
  if (approval.type === 'deployment') {
    const deployment = approval.deployment;
    return (
      <div className="approval-preview">
        <div><span>TYPE</span><Text code>{payload.type || deployment?.type || 'deployment'}</Text></div>
        {deployment?.name && <div><span>NAME</span><Text>{deployment.name}</Text></div>}
        {approval.workspace?.name && <div><span>WORKSPACE</span><Text>{approval.workspace.name}</Text></div>}
      </div>
    );
  }
  return null;
}

function runDuration(run: any) {
  const start = run.createdAt ? new Date(run.createdAt).getTime() : 0;
  const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  if (!start) return 'unknown';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function runStatusColor(status: string) {
  if (status === 'completed') return 'green';
  if (status === 'failed' || status === 'cancelled') return 'red';
  if (status === 'cancelling') return 'gold';
  return 'blue';
}

function runLogText(run: any) {
  return [
    `Agent run: ${run?.id || 'unknown'}`,
    `Status: ${run?.status || 'unknown'}`,
    `Agent: ${run?.agentId || 'unknown'}`,
    `Workspace: ${run?.workspaceId || 'unknown'}`,
    `Created: ${run?.createdAt || 'unknown'}`,
    run?.completedAt ? `Completed: ${run.completedAt}` : '',
    '',
    run?.stdout ? `STDOUT:\n${run.stdout}` : '',
    run?.stderr ? `STDERR:\n${run.stderr}` : '',
    run?.result ? `RESULT:\n${run.result}` : '',
  ].filter(Boolean).join('\n');
}

const ControlCenterModal: React.FC<Props> = ({ open, onClose, currentConversationId, initialTab = 'workspaces', onApprovalsChanged }) => {
  const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
  const [providers, setProviders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [cliRuntimes, setCliRuntimes] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [agentRuns, setAgentRuns] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any | null>(null);
  const [tree, setTree] = useState<any[]>([]);
  const [fileView, setFileView] = useState<{ path: string; content: string } | null>(null);
  const [providerEdit, setProviderEdit] = useState<any | null>(null);
  const [cliEdit, setCliEdit] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editingArtifactMode, setEditingArtifactMode] = useState<'preview' | 'edit'>('preview');
  const [logDeployment, setLogDeployment] = useState<any | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<any[]>([]);
  const [runLog, setRunLog] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [workspaceCommands, setWorkspaceCommands] = useState<Record<string, string>>({});
  const [providerForm] = Form.useForm();
  const [cliForm] = Form.useForm();
  const [runForm] = Form.useForm();
  const deploymentStates = useRef<Record<string, string>>({});
  const agentRunStates = useRef<Record<string, string>>({});

  const refresh = async () => {
    const [providerRows, agentRows, cliRows, workspaceRows, artifactRows, approvalRows, deploymentRows, runRows] = await Promise.all([
      settingsApi.providers(), agentsApi.getAgents(), settingsApi.cliRuntimes(), workspacesApi.list(), artifactsApi.list(), approvalsApi.list(), deploymentsApi.list(), agentRunsApi.list(),
    ]);
    setProviders(providerRows);
    setAgents(agentRows);
    setCliRuntimes(cliRows);
    setWorkspaces(workspaceRows);
    setArtifacts(artifactRows);
    setApprovals(approvalRows);
    setDeployments(deploymentRows);
    deploymentStates.current = Object.fromEntries(deploymentRows.map(row => [row.id, row.status]));
    agentRunStates.current = Object.fromEntries(runRows.map(row => [row.id, row.status]));
    setAgentRuns(runRows);
  };

  const refreshAfterApprovalChange = async () => {
    await refresh();
    onApprovalsChanged?.();
  };

  const cliAgents = agents.filter(agent => String(agent.adapterType || '').endsWith('-cli'));

  const createAgentRun = async (values: any) => {
    const created = await agentRunsApi.create({
      agentId: values.agentId,
      workspaceId: values.workspaceId,
      conversationId: currentConversationId || undefined,
      task: values.task,
      permissionProfile: values.permissionProfile || 'safe_write',
      mode: 'patch'
    });
    message.success('Agent run queued');
    runForm.setFieldValue('task', '');
    await refresh();
    setRunLog(created);
  };

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      refresh().catch(error => message.error(error.message));
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      Promise.all([approvalsApi.list(), deploymentsApi.list(), agentRunsApi.list()]).then(([approvalRows, deploymentRows, runRows]) => {
        setApprovals(approvalRows);
        setDeployments(deploymentRows);
        setAgentRuns(runRows);
        for (const deployment of deploymentRows) {
          const previous = deploymentStates.current[deployment.id];
          if (previous && previous !== deployment.status) {
            window.agentHubDesktop?.notifyDeployment(`${deployment.name}: ${deployment.status}`);
          }
          if (logDeployment?.id === deployment.id) setLogDeployment(deployment);
          deploymentStates.current[deployment.id] = deployment.status;
        }
        for (const run of runRows) {
          const previous = agentRunStates.current[run.id];
          if (previous && previous !== run.status) {
            window.agentHubDesktop?.notifyAgentRun(`${run.id}: ${run.status}`);
          }
          if (runLog?.id === run.id) setRunLog(run);
          agentRunStates.current[run.id] = run.status;
        }
      }).catch(() => undefined);
      if (logDeployment) deploymentsApi.logs(logDeployment.id).then(setDeploymentLogs).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [open, logDeployment, runLog]);

  const openWorkspace = async (workspace: any) => {
    setSelectedWorkspace(workspace);
    setTree(await workspacesApi.tree(workspace.id));
    setFileView(null);
  };

  return (
    <Drawer className="control-center-drawer" title={<><span className="drawer-kicker">LOCAL OPERATIONS</span><strong>控制中心</strong></>} open={open} width={960} onClose={onClose}>
      <div className="control-center-summary">
        <div className="summary-cell">
          <span className="kicker">PROVIDERS</span>
          <strong>{providers.filter(p => p.configured).length.toString().padStart(2, '0')}<em> / {providers.length.toString().padStart(2, '0')}</em></strong>
          <span className="hint">CONFIGURED</span>
        </div>
        <div className="summary-cell">
          <span className="kicker">RUNTIMES</span>
          <strong>{cliRuntimes.filter(r => r.enabled).length.toString().padStart(2, '0')}<em> / {cliRuntimes.length.toString().padStart(2, '0')}</em></strong>
          <span className="hint">ENABLED</span>
        </div>
        <div className="summary-cell">
          <span className="kicker">WORKSPACES</span>
          <strong>{workspaces.length.toString().padStart(2, '0')}</strong>
          <span className="hint">MANAGED</span>
        </div>
        <div className="summary-cell">
          <span className="kicker">APPROVALS</span>
          <strong>{approvals.filter(a => a.status === 'pending').length.toString().padStart(2, '0')}</strong>
          <span className={`status ${approvals.filter(a => a.status === 'pending').length > 0 ? 'status--warn' : 'status--ready'}`}>
            {approvals.filter(a => a.status === 'pending').length > 0 ? 'AWAITING' : 'CLEAR'}
          </span>
        </div>
        <div className="summary-cell">
          <span className="kicker">DEPLOYMENTS</span>
          <strong>{deployments.filter(d => d.status === 'running').length.toString().padStart(2, '0')}<em> / {deployments.length.toString().padStart(2, '0')}</em></strong>
          <span className="hint">LIVE</span>
        </div>
        <div className="summary-cell">
          <span className="kicker">AGENT RUNS</span>
          <strong>{agentRuns.length.toString().padStart(2, '0')}</strong>
          <span className="hint">RECENT</span>
        </div>
      </div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} tabPosition="left" items={[
        {
          key: 'providers',
          label: '模型服务',
          children: <List dataSource={providers} renderItem={provider => (
            <List.Item actions={[
              <Button key="edit" onClick={() => {
                setProviderEdit(provider);
                providerForm.setFieldsValue({ baseURL: provider.baseURL, defaultModel: provider.defaultModel, displayName: provider.displayName });
              }}>Configure</Button>,
              <Button key="test" disabled={!provider.configured} onClick={async () => {
                try {
                  const result = await settingsApi.testProvider(provider.providerType);
                  message.success(`${provider.displayName} connected (${result.model})`);
                } catch (error: any) { message.error(error.message); }
              }}>Test</Button>,
            ]}>
              <List.Item.Meta title={<Space>{provider.displayName}<Tag color={provider.configured ? 'green' : 'default'}>{provider.configured ? 'configured' : 'no key'}</Tag></Space>} description={`${provider.defaultModel}${provider.baseURL ? ` | ${provider.baseURL}` : ''}`} />
            </List.Item>
          )} />,
        },
        {
          key: 'cli-runtimes',
          label: 'CLI Runtime',
          children: <>
            <Paragraph type="secondary">
              Configure external Coding Agent runtimes. P0 targets Claude Code and Codex; OpenCode is available as a configurable runtime for P1 validation.
            </Paragraph>
            <List dataSource={cliRuntimes} renderItem={runtime => (
            <List.Item actions={[
              <Button key="edit" onClick={() => {
                setCliEdit(runtime);
                cliForm.setFieldsValue({
                  displayName: runtime.displayName,
                  executablePath: runtime.executablePath,
                  envVarName: runtime.envVarName,
                  permissionProfile: runtime.permissionProfile || 'safe_write',
                  enabled: runtime.enabled,
                });
              }}>Configure</Button>,
              <Button key="test" disabled={!runtime.enabled} onClick={async () => {
                try {
                  const result = await settingsApi.testCliRuntime(runtime.runtimeType);
                  message.success(result.output || 'CLI runtime is reachable');
                } catch (error: any) { message.error(error.message); }
              }}>Test</Button>,
            ]}>
              <List.Item.Meta
                title={<Space>{runtime.displayName}<Tag>{runtime.runtimeType}</Tag><Tag color={runtime.enabled ? 'green' : 'default'}>{runtime.enabled ? 'enabled' : 'disabled'}</Tag><Tag color={runtime.configured ? 'green' : 'default'}>{runtime.configured ? 'API key override' : 'host OAuth / PATH'}</Tag></Space>}
                description={<><div>Local executable: <Text code>{runtime.executablePath}</Text></div><Text type="secondary">Runs in a temporary workspace copy. This is not an operating-system sandbox.</Text></>}
              />
            </List.Item>
          )} />
          </>,
        },
        {
          key: 'workspaces',
          label: '工作区',
          children: <>
            <Form className="workspace-create-form" layout="inline" onFinish={async ({ name }) => { await workspacesApi.create(name); await refresh(); message.success('Workspace created'); }}>
              <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="Workspace name" /></Form.Item>
              <Button htmlType="submit" type="primary">New</Button>
              <Upload showUploadList={false} beforeUpload={async file => {
                await artifactsApi.create({
                  name: file.name,
                  type: file.type.startsWith('image/') ? 'image' : 'attachment',
                  mimeType: file.type || 'application/octet-stream',
                  encoding: 'base64',
                  content: await toBase64(file),
                });
                message.success('Attachment uploaded');
                refresh();
                return false;
              }}><Button>Upload file</Button></Upload>
              {window.agentHubDesktop && <Button onClick={async () => {
                const imported = await window.agentHubDesktop?.selectImportDirectory();
                if (!imported) return;
                const workspace = await workspacesApi.create(imported.name);
                await workspacesApi.importZip(workspace.id, imported.contentBase64);
                await refresh();
                message.success('Local directory imported as a managed workspace copy');
              }}>Import local directory</Button>}
            </Form>
            <div className="workspace-card-list">
              {workspaces.map(workspace => (
                <section key={workspace.id} className="workspace-card">
                  <div className="workspace-card-main">
                    <strong>{workspace.name}</strong>
                    <Text className="workspace-path">{workspace.rootPath}</Text>
                    {workspace.conversationId && <Tag color={workspace.conversationId === currentConversationId ? 'green' : 'blue'}>bound conversation</Tag>}
                  </div>
                  <div className="workspace-card-actions">
                    <Button onClick={() => openWorkspace(workspace)}>Files</Button>
                    <Upload showUploadList={false} accept=".zip" beforeUpload={async file => {
                      await workspacesApi.importZip(workspace.id, await toBase64(file));
                      message.success('ZIP imported as managed copy');
                      if (selectedWorkspace?.id === workspace.id) await openWorkspace(workspace);
                      return false;
                    }}><Button>Import ZIP</Button></Upload>
                    <Button onClick={async () => downloadBlob(await workspacesApi.exportZip(workspace.id), `${workspace.name}.zip`)}>Export ZIP</Button>
                    {currentConversationId && (
                      <Button onClick={async () => {
                        await workspacesApi.update(workspace.id, { conversationId: workspace.conversationId === currentConversationId ? null : currentConversationId });
                        message.success(workspace.conversationId === currentConversationId ? 'Workspace unbound from current conversation' : 'Workspace bound to current conversation');
                        refresh();
                      }}>{workspace.conversationId === currentConversationId ? 'Unbind current chat' : 'Bind current chat'}</Button>
                    )}
                    <Space size={6} wrap className="workspace-command">
                      <Select
                        size="small"
                        value={workspaceCommands[workspace.id] || WORKSPACE_COMMANDS[0]}
                        options={WORKSPACE_COMMANDS.map(command => ({ value: command, label: command }))}
                        onChange={command => setWorkspaceCommands(previous => ({ ...previous, [workspace.id]: command }))}
                      />
                      <Button size="small" onClick={async () => {
                        const command = workspaceCommands[workspace.id] || WORKSPACE_COMMANDS[0];
                        await workspacesApi.proposeCommand(workspace.id, command);
                        message.success(`${command} approval requested`);
                        await refreshAfterApprovalChange();
                      }}>Request command</Button>
                    </Space>
                    <Button onClick={async () => {
                      await deploymentsApi.create({ name: `${workspace.name} runtime`, type: 'fullstack', workspaceId: workspace.id, exposedPort: 3000 });
                      message.success('Local start approval requested. Run npm install through approval first if dependencies are missing.');
                      await refreshAfterApprovalChange();
                    }}>Start locally</Button>
                  </div>
                </section>
              ))}
            </div>
            {selectedWorkspace && <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
              <Text strong>{selectedWorkspace.name} files</Text>
              <Space align="start" style={{ width: '100%', marginTop: 8 }}>
                <List size="small" style={{ width: 260 }} dataSource={tree.filter(item => item.type === 'file')} renderItem={entry => (
                  <List.Item><Button type="link" onClick={async () => setFileView(await workspacesApi.file(selectedWorkspace.id, entry.path))}>{entry.path}</Button></List.Item>
                )} />
                <Input.TextArea readOnly value={fileView?.content || 'Select a text file to view it.'} autoSize={{ minRows: 10, maxRows: 18 }} style={{ width: 550, fontFamily: 'monospace' }} />
              </Space>
            </div>}
          </>,
        },
        {
          key: 'artifacts',
          label: '产物',
          children: <>
            <Form layout="inline" onFinish={async values => { await artifactsApi.create(values); message.success('Artifact created'); refresh(); }}>
              <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="File name" /></Form.Item>
              <Form.Item name="type" initialValue="document"><Select style={{ width: 120 }} options={[
                { value: 'web', label: 'Web' }, { value: 'code', label: 'Code' }, { value: 'document', label: 'Markdown' }, { value: 'slides', label: 'Slides' },
              ]} /></Form.Item>
              <Form.Item name="content" rules={[{ required: true }]}><Input placeholder="Initial content" /></Form.Item>
              <Button htmlType="submit" type="primary">New</Button>
            </Form>
            <List style={{ marginTop: 16 }} dataSource={artifacts} renderItem={artifact => (
              <List.Item actions={[
                <Button key="preview" onClick={async () => { setEditingArtifactMode('preview'); setEditing(await artifactsApi.get(artifact.id)); }}>Preview</Button>,
                <Button key="edit" className="artifact-edit-action" onClick={async () => { setEditingArtifactMode('edit'); setEditing(await artifactsApi.get(artifact.id)); }}>Edit</Button>,
                <Button key="download" onClick={async () => downloadBlob(await artifactsApi.download(artifact.id), artifact.name)}>Download</Button>,
                ...(artifact.type === 'slides' ? [<Button key="pptx" onClick={async () => downloadBlob(await artifactsApi.exportPptx(artifact.id), `${artifact.name}.pptx`)}>PPTX</Button>] : []),
                ...(artifact.type === 'web' ? [<Button key="deploy" onClick={async () => { await deploymentsApi.create({ name: artifact.name, type: 'static', artifactId: artifact.id }); message.success('Publish approval requested'); await refreshAfterApprovalChange(); }}>Publish</Button>] : []),
              ]}><List.Item.Meta
                title={artifact.name}
                description={<Space direction="vertical" size={4} className="artifact-list-meta">
                  <Space wrap>
                    <Tag>{artifact.type}</Tag>
                    {artifact.versions?.[0] && <Tag>v{artifact.versions[0].version}</Tag>}
                    {artifact.workspaceId && <Tag color="blue">workspace</Tag>}
                  </Space>
                  <Text type="secondary">{new Date(artifact.updatedAt).toLocaleString()}</Text>
                </Space>}
              /></List.Item>
            )} />
          </>,
        },
        {
          key: 'approvals',
          label: `审批 (${approvals.filter(item => item.status === 'pending').length})`,
          children: <List dataSource={approvals} renderItem={approval => (
            <List.Item actions={approval.status === 'pending' ? [
              <Button key="approve" type="primary" onClick={async () => { await approvalsApi.resolve(approval.id, 'approve'); await refreshAfterApprovalChange(); }}>Approve</Button>,
              <Button key="reject" danger onClick={async () => { await approvalsApi.resolve(approval.id, 'reject'); await refreshAfterApprovalChange(); }}>Reject</Button>,
            ] : []}>
              <List.Item.Meta
                title={approval.title}
                description={<Space direction="vertical" size={8} className="approval-meta">
                  <Space wrap><Tag>{approval.type}</Tag><Tag>{approval.status}</Tag></Space>
                  {approvalPreview(approval)}
                </Space>}
              />
            </List.Item>
          )} />,
        },
        {
          key: 'deployments',
          label: '部署',
          children: <List dataSource={deployments} renderItem={deployment => (
            <List.Item actions={[
              ...(deployment.previewUrl ? [<Button key="visit" href={`${apiOrigin}${deployment.previewUrl}`} target="_blank">Open</Button>] : []),
              <Button key="logs" onClick={async () => { setLogDeployment(deployment); setDeploymentLogs(await deploymentsApi.logs(deployment.id)); }}>Logs</Button>,
              <Button key="stop" onClick={async () => { await deploymentsApi.stop(deployment.id); refresh(); }}>Stop</Button>,
              <Button key="redeploy" onClick={async () => { await deploymentsApi.redeploy(deployment.id); refresh(); }}>Redeploy</Button>,
            ]}>
              <List.Item.Meta title={deployment.name} description={<><Space><Tag>{deployment.type}</Tag><Tag color="blue">{deployment.status}</Tag></Space><Paragraph ellipsis={{ rows: 2 }}>{deployment.logs}</Paragraph></>} />
            </List.Item>
          )} />,
        },
        {
          key: 'runs',
          label: `Agent 运行 (${agentRuns.length})`,
          children: <>
            <Form
              form={runForm}
              layout="vertical"
              className="agent-run-create"
              initialValues={{ permissionProfile: 'safe_write' }}
              onFinish={createAgentRun}
            >
              <Space align="end" wrap>
                <Form.Item name="agentId" label="CLI Agent" rules={[{ required: true, message: '请选择 CLI Agent' }]}>
                  <Select style={{ width: 220 }} placeholder="选择 Claude/Codex/OpenCode">
                    {cliAgents.map(agent => <Select.Option key={agent.id} value={agent.id}>{agent.name} · {agent.adapterType}</Select.Option>)}
                  </Select>
                </Form.Item>
                <Form.Item name="workspaceId" label="Workspace" rules={[{ required: true, message: '请选择 workspace' }]}>
                  <Select style={{ width: 220 }} placeholder="选择工作区">
                    {workspaces.map(workspace => <Select.Option key={workspace.id} value={workspace.id}>{workspace.name}</Select.Option>)}
                  </Select>
                </Form.Item>
                <Form.Item name="permissionProfile" label="权限档位">
                  <Select style={{ width: 150 }}>
                    <Select.Option value="readonly">readonly</Select.Option>
                    <Select.Option value="safe_write">safe_write</Select.Option>
                  </Select>
                </Form.Item>
              </Space>
              <Form.Item name="task" label="任务" rules={[{ required: true, message: '请输入 Agent 任务' }]}>
                <Input.TextArea rows={3} placeholder="例如：检查当前 workspace 的前端布局溢出问题，并提出受审批保护的修改。" />
              </Form.Item>
              <Button type="primary" htmlType="submit" disabled={!cliAgents.length || !workspaces.length}>Start Agent run</Button>
              {!cliAgents.length && <Text type="secondary" style={{ marginLeft: 12 }}>需要先创建或启用 Claude Code / Codex / OpenCode Agent。</Text>}
            </Form>
            <Space style={{ marginBottom: 12 }} wrap>
              <Button onClick={refresh}>Refresh runs</Button>
              <Tag color="blue">{agentRuns.filter(run => ACTIVE_RUN_STATUSES.includes(run.status)).length} active</Tag>
              <Tag>{agentRuns.filter(run => run.diffSummary?.length).length} with diff</Tag>
            </Space>
            <List dataSource={agentRuns} renderItem={run => (
              <List.Item actions={[
                <Button key="logs" onClick={() => setRunLog(run)}>Logs</Button>,
                ...((run.diffSummary || []).length ? [<Button key="approvals" onClick={() => setActiveTab('approvals')}>Diff approvals</Button>] : []),
                ...(['failed', 'cancelled'].includes(run.status) ? [<Button key="retry" onClick={async () => { const retried = await agentRunsApi.retry(run.id); await refresh(); setRunLog(retried); }}>Retry</Button>] : []),
                ...(ACTIVE_RUN_STATUSES.includes(run.status) ? [<Button key="cancel" danger onClick={async () => { await agentRunsApi.cancel(run.id); await refresh(); }}>Cancel</Button>] : []),
              ]}>
                <List.Item.Meta
                  title={<Space wrap><Text code>{run.id}</Text><Tag color={runStatusColor(run.status)}>{run.status}</Tag><Tag>{runDuration(run)}</Tag></Space>}
                  description={<Space direction="vertical" size={4} className="agent-run-meta">
                    <Space wrap>
                      <Text>workspace: {run.workspaceId}</Text>
                      <Text>agent: {run.agentId}</Text>
                      {(run.diffSummary || []).length > 0 && <Tag color="gold">{run.diffSummary.length} diff approval(s)</Tag>}
                    </Space>
                    <Paragraph ellipsis={{ rows: 2 }}>{run.result || run.stdout || run.stderr || 'No output yet.'}</Paragraph>
                  </Space>}
                />
              </List.Item>
            )} />
          </>,
        },
      ]} />
      <Modal title={`Configure ${providerEdit?.displayName || ''}`} open={Boolean(providerEdit)} onCancel={() => setProviderEdit(null)} footer={null}>
        <Form form={providerForm} layout="vertical" onFinish={async values => {
          await settingsApi.saveProvider(providerEdit.providerType, values);
          message.success('Provider configuration saved securely');
          setProviderEdit(null);
          refresh();
        }}>
          <Form.Item name="displayName" label="Display name"><Input /></Form.Item>
          <Form.Item name="baseURL" label="Base URL"><Input placeholder="OpenAI-compatible endpoint" /></Form.Item>
          <Form.Item name="defaultModel" label="Model"><Input /></Form.Item>
          <Form.Item name="apiKey" label="API Key"><Input.Password placeholder={providerEdit?.configured ? 'Leave empty to keep current key' : 'Required'} /></Form.Item>
          <Button type="primary" htmlType="submit">Save</Button>
        </Form>
      </Modal>
      <Modal title={`Configure ${cliEdit?.displayName || ''}`} open={Boolean(cliEdit)} onCancel={() => setCliEdit(null)} footer={null}>
        <Form form={cliForm} layout="vertical" onFinish={async values => {
          await settingsApi.saveCliRuntime(cliEdit.runtimeType, values);
          message.success('CLI runtime saved securely');
          setCliEdit(null);
          refresh();
        }}>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="displayName" label="Display name"><Input /></Form.Item>
          <Paragraph type="warning">Local runtimes execute on this host in a temporary workspace copy. Use only on a trusted local machine.</Paragraph>
          <Form.Item name="executablePath" label="Executable path" rules={[{ required: true }]}><Input placeholder="/home/user/bin/claude" /></Form.Item>
          <Form.Item name="permissionProfile" label="Default permission" initialValue="safe_write">
            <Select options={[
              { value: 'safe_write', label: 'Safe write: temporary workspace files + approval' },
              { value: 'readonly', label: 'Readonly: review only' },
            ]} />
          </Form.Item>
          <Form.Item name="envVarName" label="API key env var" rules={[{ required: true }]}><Input placeholder="CODEX_CLI_API_KEY" /></Form.Item>
          <Form.Item name="apiKey" label="CLI API Key override">
            <Input.Password placeholder={cliEdit?.configured ? 'Leave empty to keep current key' : 'Optional. Claude Code can reuse host OAuth.'} />
          </Form.Item>
          <Button type="primary" htmlType="submit">Save</Button>
        </Form>
      </Modal>
      <ArtifactEditorModal artifact={editing} mode={editingArtifactMode} onClose={() => setEditing(null)} onSaved={refresh} />
      <Drawer
        className="deployment-log-drawer"
        title={logDeployment ? <Space wrap><span>{logDeployment.name}</span><Tag color="blue">{logDeployment.status}</Tag></Space> : 'Deployment logs'}
        open={Boolean(logDeployment)}
        width={720}
        onClose={() => setLogDeployment(null)}
        extra={logDeployment && <Button onClick={async () => setDeploymentLogs(await deploymentsApi.logs(logDeployment.id))}>Refresh</Button>}
      >
        <List
          className="deployment-log-list"
          dataSource={deploymentLogs}
          locale={{ emptyText: 'No deployment logs yet.' }}
          renderItem={entry => <List.Item><Tag color={entry.level === 'error' ? 'red' : 'blue'}>{entry.level}</Tag><Text code>{entry.message}</Text></List.Item>}
        />
      </Drawer>
      <Modal
        title={`Agent run ${runLog?.id || ''}`}
        open={Boolean(runLog)}
        footer={null}
        onCancel={() => setRunLog(null)}
        width={760}
      >
        <Space style={{ marginBottom: 10 }} wrap>
          <Tag color={runStatusColor(runLog?.status)}>{runLog?.status || 'unknown'}</Tag>
          {window.agentHubDesktop && runLog && (
            <Button onClick={async () => {
              await window.agentHubDesktop?.exportText({ fileName: `agent-run-${runLog.id}.log`, content: runLogText(runLog) });
            }}>Export log</Button>
          )}
        </Space>
        <Input.TextArea readOnly value={runLog ? runLogText(runLog) : ''} autoSize={{ minRows: 12, maxRows: 24 }} style={{ fontFamily: 'monospace' }} />
      </Modal>
    </Drawer>
  );
};

export default ControlCenterModal;
