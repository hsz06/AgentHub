import { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button, Input, Modal, Space, Tag, Tooltip, message } from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  CodeOutlined,
  DownOutlined,
  FileOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  RightOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Workspace, WorkspaceFile, WorkspaceFileContent } from '../types';
import { approvalsApi, workspacesApi } from '../services';

interface Props {
  conversationId?: string | null;
  mobile?: boolean;
  onOpenControlCenter: () => void;
  onApprovalsChanged?: () => void;
}

interface OpenFile extends WorkspaceFileContent {
  draft: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: TreeNode[];
}

function languageFor(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  return ({
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', html: 'html', yaml: 'yaml',
    yml: 'yaml', py: 'python', sh: 'shell', prisma: 'prisma',
  } as Record<string, string>)[extension || ''] || 'plaintext';
}

const WorkspaceWorkbench: React.FC<Props> = ({ conversationId, mobile = false, onOpenControlCenter, onApprovalsChanged }) => {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<WorkspaceFile[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});

  const loadWorkspace = async () => {
    if (!conversationId) {
      setWorkspace(null);
      setTree([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await workspacesApi.list();
      const bound = rows.find(item => item.conversationId === conversationId) || null;
      setWorkspace(bound);
      setTree(bound ? await workspacesApi.tree(bound.id) : []);
      if (!bound) {
        setOpenFiles([]);
        setActivePath('');
      }
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOpenFiles([]);
    setActivePath('');
    setPending({});
    setExpandedDirs({});
    loadWorkspace();
  }, [conversationId]);

  useEffect(() => {
    if (!workspace || Object.keys(pending).length === 0) return;
    const timer = window.setInterval(async () => {
      const approvals = await approvalsApi.list().catch(() => []);
      for (const [path, approvalId] of Object.entries(pending)) {
        const approval = approvals.find(item => item.id === approvalId);
        if (!approval || approval.status === 'pending') continue;
        onApprovalsChanged?.();
        setPending(previous => {
          const next = { ...previous };
          delete next[path];
          return next;
        });
        if (approval.status === 'approved') {
          const refreshed = await workspacesApi.file(workspace.id, path);
          setOpenFiles(previous => previous.map(item => item.path === path ? { ...refreshed, draft: refreshed.content } : item));
          message.success(`${path} 已写入 workspace。`);
        } else {
          message.warning(`${path} 未写入：${approval.status === 'conflict' ? '检测到冲突，请处理合并审批。' : '审批未通过。'}`);
        }
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [pending, workspace, onApprovalsChanged]);

  const visibleFiles = useMemo(() => tree
    .filter(item => item.type === 'file')
    .filter(item => item.path.toLowerCase().includes(query.trim().toLowerCase())), [query, tree]);
  const fileTree = useMemo(() => {
    const root: TreeNode = { name: '', path: '', type: 'directory', children: [] };
    for (const entry of tree) {
      const parts = entry.path.split('/').filter(Boolean);
      let current = root;
      parts.forEach((part, index) => {
        const nodePath = parts.slice(0, index + 1).join('/');
        let child = current.children.find(item => item.path === nodePath);
        if (!child) {
          child = {
            name: part,
            path: nodePath,
            type: index === parts.length - 1 ? entry.type : 'directory',
            children: [],
          };
          current.children.push(child);
        }
        current = child;
      });
    }
    const sortNodes = (nodes: TreeNode[]): TreeNode[] => nodes
      .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1)
      .map(node => ({ ...node, children: sortNodes(node.children) }));
    return sortNodes(root.children);
  }, [tree]);
  const activeFile = openFiles.find(item => item.path === activePath);
  const dirty = Boolean(activeFile && activeFile.draft !== activeFile.content);

  const openFile = async (path: string) => {
    const cached = openFiles.find(item => item.path === path);
    if (cached) return setActivePath(path);
    if (!workspace) return;
    try {
      const file = await workspacesApi.file(workspace.id, path);
      setOpenFiles(previous => [...previous, { ...file, draft: file.content }]);
      setActivePath(path);
    } catch (error: any) {
      message.error(`无法打开文件：${error.message}`);
    }
  };

  const closeFile = (path: string) => {
    const target = openFiles.find(item => item.path === path);
    const finish = () => {
      setOpenFiles(previous => previous.filter(item => item.path !== path));
      if (activePath === path) setActivePath(openFiles.find(item => item.path !== path)?.path || '');
    };
    if (target?.draft !== target?.content) {
      Modal.confirm({ title: '放弃未提交的修改？', content: path, okText: '放弃', cancelText: '继续编辑', onOk: finish });
    } else finish();
  };

  const submitChange = async () => {
    if (!workspace || !activeFile || !dirty) return;
    try {
      const approval = await workspacesApi.proposeFileChange(workspace.id, activeFile.path, activeFile.hash, activeFile.draft, activeFile.content);
      setPending(previous => ({ ...previous, [activeFile.path]: approval.id }));
      onApprovalsChanged?.();
      message.success('修改已提交审批，审批通过后才会写入 workspace。');
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const toggleDir = (path: string) => {
    setExpandedDirs(previous => ({ ...previous, [path]: !previous[path] }));
  };

  const renderTreeNode = (node: TreeNode, depth = 0) => {
    if (node.type === 'directory') {
      const expanded = expandedDirs[node.path] ?? depth < 1;
      return (
        <div key={node.path} className="workbench-tree-node">
          <button className="workbench-tree-row workbench-tree-row--dir" style={{ paddingLeft: 8 + depth * 12 }} onClick={() => toggleDir(node.path)}>
            {expanded ? <DownOutlined /> : <RightOutlined />}
            {expanded ? <FolderOpenOutlined /> : <FolderOutlined />}
            <span>{node.name}</span>
          </button>
          {expanded && node.children.map(child => renderTreeNode(child, depth + 1))}
        </div>
      );
    }
    return (
      <button
        className={`workbench-tree-row ${node.path === activePath ? 'is-active' : ''}`}
        key={node.path}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => openFile(node.path)}
      >
        <FileOutlined />
        <span>{node.name}</span>
      </button>
    );
  };

  return (
    <section className={`workspace-workbench ${mobile ? 'workspace-workbench--mobile' : ''}`}>
      <header className="workbench-header">
        <div>
          <span className="kicker workbench-kicker">WORKSPACE · {workspace ? 'BOUND' : 'UNBOUND'}</span>
          <strong>{workspace?.name || '未绑定工作区'}</strong>
        </div>
        <Space size={4}>
          {workspace && <Tooltip title="刷新文件树"><Button type="text" icon={<ReloadOutlined spin={loading} />} onClick={loadWorkspace} /></Tooltip>}
          <Tag>{workspace ? 'ONLINE' : 'OFFLINE'}</Tag>
        </Space>
      </header>

      {!workspace ? (
        <div className="workbench-empty">
          <div className="glyph">⌘</div>
          <span className="kicker">NO WORKSPACE BOUND</span>
          <p>为当前会话绑定一个本地工作区, Agent 的所有改动都会先生成 diff, 等待你的审批后才会写回原目录。</p>
          <Button type="primary" onClick={onOpenControlCenter}>绑定工作区</Button>
        </div>
      ) : (
        <div className="workbench-body">
          <aside className="workbench-files">
            <Input prefix={<SearchOutlined />} value={query} onChange={event => setQuery(event.target.value)} placeholder="filter files" allowClear />
            <div className="workbench-file-list">
              {query.trim()
                ? visibleFiles.map(file => (
                  <button className={`workbench-tree-row ${file.path === activePath ? 'is-active' : ''}`} key={file.path} onClick={() => openFile(file.path)}>
                    <FileOutlined />
                    <span>{file.path}</span>
                  </button>
                ))
                : fileTree.map(node => renderTreeNode(node))}
            </div>
          </aside>
          <div className="workbench-editor">
            {openFiles.length > 0 && <div className="workbench-tabs">
              {openFiles.map(file => (
                <button className={file.path === activePath ? 'is-active' : ''} key={file.path} onClick={() => setActivePath(file.path)}>
                  {file.draft !== file.content && <i />}
                  <span>{file.path.split('/').pop()}</span>
                  <CloseOutlined onClick={event => { event.stopPropagation(); closeFile(file.path); }} />
                </button>
              ))}
            </div>}
            {activeFile ? (
              <>
                <div className="workbench-toolbar">
                  <Space size={8}><CodeOutlined /><span>{activeFile.path}</span></Space>
                  <Space size={6}>
                    {mobile ? <Tag>READONLY</Tag> : pending[activeFile.path] ? <Tag color="gold">AWAITING APPROVAL</Tag> : dirty ? <Tag color="gold">UNSTAGED</Tag> : <Tag icon={<CheckCircleOutlined />}>SYNCED</Tag>}
                    {!mobile && <Button type="primary" size="small" icon={<SaveOutlined />} disabled={!dirty || Boolean(pending[activeFile.path])} onClick={submitChange}>SUBMIT FOR APPROVAL</Button>}
                  </Space>
                </div>
                <Editor
                  height="100%"
                  language={languageFor(activeFile.path)}
                  theme="vs-dark"
                  value={activeFile.draft}
                  onChange={value => !mobile && setOpenFiles(previous => previous.map(item => item.path === activeFile.path ? { ...item, draft: value || '' } : item))}
                  options={{ readOnly: mobile, minimap: { enabled: false }, fontSize: 12.5, fontFamily: '"JetBrains Mono", "SFMono-Regular", monospace', padding: { top: 16 }, scrollBeyondLastLine: false, smoothScrolling: true }}
                />
              </>
            ) : (
              <div className="workbench-empty">
                <div className="glyph">✏︎</div>
                <span className="kicker">NO FILE OPEN</span>
                <p>{visibleFiles[0] ? `选择 ${visibleFiles[0].path} 开始预览或编辑` : '从左侧文件树选择文件开始审阅或编辑'}</p>
                {visibleFiles[0] && <Button onClick={() => openFile(visibleFiles[0].path)}>打开第一个文件</Button>}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default WorkspaceWorkbench;
