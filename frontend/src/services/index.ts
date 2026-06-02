import { io, Socket } from 'socket.io-client';
import { Agent, BackendConversation, User } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const TOKEN_KEY = 'agenthub.token';

export const authToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (value: string) => localStorage.setItem(TOKEN_KEY, value),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = authToken.get();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || 'Request failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function requestBlob(path: string, options: RequestInit = {}) {
  const token = authToken.get();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: response.statusText }))).error);
  return response.blob();
}

export const authApi = {
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<User>('/auth/me'),
};

export const conversationsApi = {
  list: () => request<BackendConversation[]>('/conversations'),
  create: (title: string, type: 'single' | 'group', agentIds: string[]) =>
    request<BackendConversation>('/conversations', { method: 'POST', body: JSON.stringify({ title, type, agentIds }) }),
  update: (id: string, data: Partial<{ title: string; pinned: boolean; archived: boolean }>) =>
    request<BackendConversation>(`/conversations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  orchestrations: (id: string) => request<any[]>(`/conversations/${id}/orchestrations`),
};

export const messagesApi = {
  togglePinMessage: (messageId: string) => request<any>(`/messages/${messageId}/toggle-pin`, { method: 'PATCH' }),
  getMessages: (conversationId: string) => request<any[]>(`/messages/conversation/${conversationId}`),
};

export interface CreateAgentData {
  name: string;
  avatar?: string;
  description?: string;
  capabilities?: string[];
  systemPrompt?: string;
  adapterType: 'openai' | 'claude' | 'mimo' | 'claude-code-cli' | 'codex-cli' | 'opencode-cli';
  model?: string;
  tools?: string[];
}

export const agentsApi = {
  getAgents: () => request<Agent[]>('/agents'),
  createAgent: (data: CreateAgentData) => request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id: string, data: Partial<CreateAgentData>) => request<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAgent: (id: string) => request<void>(`/agents/${id}`, { method: 'DELETE' }),
};

export const settingsApi = {
  providers: () => request<Array<{ providerType: 'openai' | 'anthropic' | 'mimo'; displayName: string; baseURL?: string | null; defaultModel: string; configured: boolean }>>('/settings/providers'),
  saveProvider: (provider: 'openai' | 'anthropic' | 'mimo', data: { apiKey?: string; baseURL?: string; defaultModel?: string; displayName?: string }) =>
    request(`/settings/providers/${provider}`, { method: 'PUT', body: JSON.stringify(data) }),
  testProvider: (provider: 'openai' | 'anthropic' | 'mimo') =>
    request<{ ok: boolean; model: string }>(`/settings/providers/${provider}/test`, { method: 'POST' }),
  cliRuntimes: () => request<Array<{ runtimeType: 'claude-code' | 'codex' | 'opencode'; displayName: string; dockerImage: string; commandTemplate: string; envVarName: string; enabled: boolean; configured: boolean }>>('/settings/cli-runtimes'),
  saveCliRuntime: (runtimeType: 'claude-code' | 'codex' | 'opencode', data: { displayName?: string; dockerImage?: string; commandTemplate?: string; envVarName?: string; enabled?: boolean; apiKey?: string }) =>
    request(`/settings/cli-runtimes/${runtimeType}`, { method: 'PUT', body: JSON.stringify(data) }),
  testCliRuntime: (runtimeType: 'claude-code' | 'codex' | 'opencode') =>
    request<{ ok: boolean; output: string }>(`/settings/cli-runtimes/${runtimeType}/test`, { method: 'POST' }),
};

export const approvalsApi = {
  list: () => request<any[]>('/approvals'),
  create: (data: { type: string; title: string; workspaceId?: string; payload: Record<string, unknown> }) =>
    request<any>('/approvals', { method: 'POST', body: JSON.stringify(data) }),
  resolve: (id: string, action: 'approve' | 'reject') =>
    request(`/approvals/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action }) }),
};

export const artifactsApi = {
  list: () => request<any[]>('/artifacts'),
  get: (id: string) => request<any>(`/artifacts/${id}`),
  version: (id: string, versionId: string) => request<any>(`/artifacts/${id}/versions/${versionId}`),
  create: (data: { name: string; type: string; content: string; workspaceId?: string; mimeType?: string; encoding?: string }) =>
    request<any>('/artifacts', { method: 'POST', body: JSON.stringify(data) }),
  createVersion: (id: string, content: string) =>
    request<any>(`/artifacts/${id}/versions`, { method: 'POST', body: JSON.stringify({ content }) }),
  download: (id: string) => requestBlob(`/artifacts/${id}/download`),
  exportPptx: (id: string) => requestBlob(`/artifacts/${id}/export/pptx`, { method: 'POST' }),
};

export const deploymentsApi = {
  list: () => request<any[]>('/deployments'),
  create: (data: { name: string; type: 'static' | 'fullstack'; artifactId?: string; workspaceId?: string; exposedPort?: number }) =>
    request<any>('/deployments', { method: 'POST', body: JSON.stringify(data) }),
  stop: (id: string) => request<any>(`/deployments/${id}/stop`, { method: 'POST' }),
  redeploy: (id: string) => request<any>(`/deployments/${id}/redeploy`, { method: 'POST' }),
  logs: (id: string) => request<any[]>(`/deployments/${id}/logs`),
};

export const workspacesApi = {
  list: () => request<any[]>('/workspaces'),
  create: (name: string) => request<any>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: string, data: { name?: string; conversationId?: string | null }) =>
    request<any>(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  tree: (id: string) => request<any[]>(`/workspaces/${id}/tree`),
  file: (id: string, filePath: string) => request<{ path: string; content: string; hash: string }>(`/workspaces/${id}/file?path=${encodeURIComponent(filePath)}`),
  importZip: (id: string, contentBase64: string) => request<any>(`/workspaces/${id}/import`, { method: 'POST', body: JSON.stringify({ contentBase64 }) }),
  exportZip: (id: string) => requestBlob(`/workspaces/${id}/export`),
  remove: (id: string) => request<void>(`/workspaces/${id}`, { method: 'DELETE' }),
};

export const agentRunsApi = {
  create: (data: { agentId: string; workspaceId: string; conversationId?: string; task: string; mode?: string; permissionProfile?: 'readonly' | 'safe_write' | 'autonomous'; model?: string }) =>
    request<any>('/agent-runs', { method: 'POST', body: JSON.stringify(data) }),
  get: (id: string) => request<any>(`/agent-runs/${id}`),
  cancel: (id: string) => request<any>(`/agent-runs/${id}/cancel`, { method: 'POST' }),
};

export function connectSocket(): Socket {
  return io(SOCKET_URL, { auth: { token: authToken.get() }, transports: ['websocket', 'polling'] });
}
