import { useEffect, useRef, useState } from 'react';
import { Button, Form, Input, List, Modal, Select, Space, Switch, Tabs, Tag, Typography, Upload, message } from 'antd';
import { agentRunsApi, approvalsApi, artifactsApi, deploymentsApi, settingsApi, workspacesApi } from '../services';
import ArtifactEditorModal from './ArtifactEditorModal';

interface Props {
  open: boolean;
  onClose: () => void;
  currentConversationId?: string | null;
}

const { Text, Paragraph } = Typography;

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

const ControlCenterModal: React.FC<Props> = ({ open, onClose, currentConversationId }) => {
  const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
  const [providers, setProviders] = useState<any[]>([]);
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
  const [logDeployment, setLogDeployment] = useState<any | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<any[]>([]);
  const [runLog, setRunLog] = useState<any | null>(null);
  const [providerForm] = Form.useForm();
  const [cliForm] = Form.useForm();
  const deploymentStates = useRef<Record<string, string>>({});

  const refresh = async () => {
    const [providerRows, cliRows, workspaceRows, artifactRows, approvalRows, deploymentRows] = await Promise.all([
      settingsApi.providers(), settingsApi.cliRuntimes(), workspacesApi.list(), artifactsApi.list(), approvalsApi.list(), deploymentsApi.list(),
    ]);
    setProviders(providerRows);
    setCliRuntimes(cliRows);
    setWorkspaces(workspaceRows);
    setArtifacts(artifactRows);
    setApprovals(approvalRows);
    setDeployments(deploymentRows);
    deploymentStates.current = Object.fromEntries(deploymentRows.map(row => [row.id, row.status]));
    const discoveredRuns = approvalRows
      .map(row => {
        try { return JSON.parse(row.payload || '{}').cliRunId; } catch { return null; }
      })
      .filter(Boolean);
    const runRows = await Promise.all([...new Set(discoveredRuns)].map(id => agentRunsApi.get(id).catch(() => null)));
    setAgentRuns(runRows.filter(Boolean));
  };

  useEffect(() => {
    if (open) refresh().catch(error => message.error(error.message));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      Promise.all([approvalsApi.list(), deploymentsApi.list()]).then(([approvalRows, deploymentRows]) => {
        setApprovals(approvalRows);
        setDeployments(deploymentRows);
        for (const deployment of deploymentRows) {
          const previous = deploymentStates.current[deployment.id];
          if (previous && previous !== deployment.status) {
            window.agentHubDesktop?.notifyDeployment(`${deployment.name}: ${deployment.status}`);
          }
          deploymentStates.current[deployment.id] = deployment.status;
        }
      }).catch(() => undefined);
      if (logDeployment) deploymentsApi.logs(logDeployment.id).then(setDeploymentLogs).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [open, logDeployment]);

  const openWorkspace = async (workspace: any) => {
    setSelectedWorkspace(workspace);
    setTree(await workspacesApi.tree(workspace.id));
    setFileView(null);
  };

  return (
    <Modal title="Control Center" open={open} width={940} footer={null} onCancel={onClose}>
      <Tabs items={[
        {
          key: 'providers',
          label: 'Providers',
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
          label: 'CLI Runtimes',
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
                  dockerImage: runtime.dockerImage,
                  commandTemplate: runtime.commandTemplate,
                  envVarName: runtime.envVarName,
                  permissionProfile: runtime.permissionProfile || 'safe_write',
                  enabled: runtime.enabled,
                });
              }}>Configure</Button>,
              <Button key="test" disabled={!runtime.enabled || !runtime.configured} onClick={async () => {
                try {
                  const result = await settingsApi.testCliRuntime(runtime.runtimeType);
                  message.success(result.output || 'CLI runtime is reachable');
                } catch (error: any) { message.error(error.message); }
              }}>Test</Button>,
            ]}>
              <List.Item.Meta
                title={<Space>{runtime.displayName}<Tag>{runtime.runtimeType}</Tag><Tag color={runtime.enabled ? 'green' : 'default'}>{runtime.enabled ? 'enabled' : 'disabled'}</Tag><Tag color={runtime.configured ? 'green' : 'default'}>{runtime.configured ? 'key configured' : 'no key'}</Tag></Space>}
                description={<><div>{runtime.dockerImage}</div><Text code>{runtime.commandTemplate}</Text></>}
              />
            </List.Item>
          )} />
          </>,
        },
        {
          key: 'workspaces',
          label: 'Workspaces',
          children: <>
            <Form layout="inline" onFinish={async ({ name }) => { await workspacesApi.create(name); await refresh(); message.success('Workspace created'); }}>
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
            <List style={{ marginTop: 12 }} dataSource={workspaces} renderItem={workspace => (
              <List.Item actions={[
                <Button key="open" onClick={() => openWorkspace(workspace)}>Files</Button>,
                <Upload key="import" showUploadList={false} accept=".zip" beforeUpload={async file => {
                  await workspacesApi.importZip(workspace.id, await toBase64(file));
                  message.success('ZIP imported as managed copy');
                  if (selectedWorkspace?.id === workspace.id) await openWorkspace(workspace);
                  return false;
                }}><Button>Import ZIP</Button></Upload>,
                <Button key="export" onClick={async () => downloadBlob(await workspacesApi.exportZip(workspace.id), `${workspace.name}.zip`)}>Export ZIP</Button>,
                ...(currentConversationId ? [<Button key="bind" onClick={async () => {
                  await workspacesApi.update(workspace.id, { conversationId: workspace.conversationId === currentConversationId ? null : currentConversationId });
                  message.success(workspace.conversationId === currentConversationId ? 'Workspace unbound from current conversation' : 'Workspace bound to current conversation');
                  refresh();
                }}>{workspace.conversationId === currentConversationId ? 'Unbind current chat' : 'Bind current chat'}</Button>] : []),
                <Button key="deploy" onClick={async () => {
                  await deploymentsApi.create({ name: `${workspace.name} runtime`, type: 'fullstack', workspaceId: workspace.id, exposedPort: 3000 });
                  message.success('Docker deployment approval requested');
                  refresh();
                }}>Deploy</Button>,
              ]}><List.Item.Meta title={workspace.name} description={<Space direction="vertical" size={2}><Text>{workspace.rootPath}</Text>{workspace.conversationId && <Tag color={workspace.conversationId === currentConversationId ? 'green' : 'blue'}>bound conversation</Tag>}</Space>} /></List.Item>
            )} />
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
          label: 'Artifacts',
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
                <Button key="edit" onClick={async () => setEditing(await artifactsApi.get(artifact.id))}>Edit</Button>,
                <Button key="download" onClick={async () => downloadBlob(await artifactsApi.download(artifact.id), artifact.name)}>Download</Button>,
                ...(artifact.type === 'slides' ? [<Button key="pptx" onClick={async () => downloadBlob(await artifactsApi.exportPptx(artifact.id), `${artifact.name}.pptx`)}>PPTX</Button>] : []),
                ...(artifact.type === 'web' ? [<Button key="deploy" onClick={async () => { await deploymentsApi.create({ name: artifact.name, type: 'static', artifactId: artifact.id }); message.success('Publish approval requested'); refresh(); }}>Publish</Button>] : []),
              ]}><List.Item.Meta title={artifact.name} description={<Tag>{artifact.type}</Tag>} /></List.Item>
            )} />
          </>,
        },
        {
          key: 'approvals',
          label: `Approvals (${approvals.filter(item => item.status === 'pending').length})`,
          children: <List dataSource={approvals} renderItem={approval => (
            <List.Item actions={approval.status === 'pending' ? [
              <Button key="approve" type="primary" onClick={async () => { await approvalsApi.resolve(approval.id, 'approve'); refresh(); }}>Approve</Button>,
              <Button key="reject" danger onClick={async () => { await approvalsApi.resolve(approval.id, 'reject'); refresh(); }}>Reject</Button>,
            ] : []}>
              <List.Item.Meta title={approval.title} description={<Space><Tag>{approval.type}</Tag><Tag>{approval.status}</Tag></Space>} />
            </List.Item>
          )} />,
        },
        {
          key: 'deployments',
          label: 'Deployments',
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
          label: `Agent Runs (${agentRuns.length})`,
          children: <List dataSource={agentRuns} renderItem={run => (
            <List.Item actions={[
              <Button key="logs" onClick={() => setRunLog(run)}>Logs</Button>,
              ...(['queued', 'running', 'cancelling'].includes(run.status) ? [<Button key="cancel" danger onClick={async () => { await agentRunsApi.cancel(run.id); refresh(); }}>Cancel</Button>] : []),
            ]}>
              <List.Item.Meta
                title={<Space><span>{run.id}</span><Tag color={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'blue'}>{run.status}</Tag></Space>}
                description={<Space direction="vertical" size={2}><Text>workspace: {run.workspaceId}</Text><Paragraph ellipsis={{ rows: 2 }}>{run.result || run.stdout || run.stderr}</Paragraph></Space>}
              />
            </List.Item>
          )} />,
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
          <Form.Item name="dockerImage" label="Docker image" rules={[{ required: true }]}><Input placeholder="node:20-alpine" /></Form.Item>
          <Form.Item name="commandTemplate" label="Command template" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder={'codex exec --full-auto "$(cat /workspace/.agenthub/prompt.txt)"'} />
          </Form.Item>
          <Form.Item name="permissionProfile" label="Default permission" initialValue="safe_write">
            <Select options={[
              { value: 'safe_write', label: 'Safe write: workspace files + approval' },
              { value: 'readonly', label: 'Readonly: review only' },
            ]} />
          </Form.Item>
          <Form.Item name="envVarName" label="API key env var" rules={[{ required: true }]}><Input placeholder="CODEX_CLI_API_KEY" /></Form.Item>
          <Form.Item name="apiKey" label="CLI API Key"><Input.Password placeholder={cliEdit?.configured ? 'Leave empty to keep current key' : 'Required for execution'} /></Form.Item>
          <Button type="primary" htmlType="submit">Save</Button>
        </Form>
      </Modal>
      <ArtifactEditorModal artifact={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <Modal title={`${logDeployment?.name || ''} logs`} open={Boolean(logDeployment)} footer={null} onCancel={() => setLogDeployment(null)}>
        <List dataSource={deploymentLogs} renderItem={entry => <List.Item><Tag color={entry.level === 'error' ? 'red' : 'blue'}>{entry.level}</Tag><Text code>{entry.message}</Text></List.Item>} />
      </Modal>
      <Modal title={`Agent run ${runLog?.id || ''}`} open={Boolean(runLog)} footer={null} onCancel={() => setRunLog(null)} width={760}>
        <Input.TextArea readOnly value={[runLog?.stdout, runLog?.stderr && `STDERR:\n${runLog.stderr}`, runLog?.result].filter(Boolean).join('\n\n')} autoSize={{ minRows: 12, maxRows: 24 }} style={{ fontFamily: 'monospace' }} />
      </Modal>
    </Modal>
  );
};

export default ControlCenterModal;
