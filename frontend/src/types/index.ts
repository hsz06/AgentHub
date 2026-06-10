export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Agent {
  id: string;
  name: string;
  avatar?: string | null;
  description?: string | null;
  capabilities: string | string[];
  systemPrompt?: string | null;
  adapterType: 'openai' | 'claude' | 'mimo' | 'claude-code-cli' | 'codex-cli' | 'opencode-cli';
  model?: string | null;
  tools?: string | string[];
  isBuiltin: boolean;
  createdAt?: string;
  updatedAt?: string;
  tags: string[];
  iconType: string;
  color: string;
}

export interface BackendConversation {
  id: string;
  title?: string | null;
  type: 'single' | 'group';
  pinned: boolean;
  archived: boolean;
  lastActiveAt: string;
  members: Array<{ agent: Agent }>;
}

export interface Message {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'user' | 'agent';
  status?: 'streaming' | 'completed' | 'failed';
  createdAt: string;
  isPinned?: boolean;
  quotedMessageId?: string | null;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  preview_cards?: PreviewCardData[];
  mentionedAgentIds?: string[];
}

export type PreviewCardType = 'web-preview' | 'code-diff' | 'image' | 'file-attachment' | 'deployment-status' | 'document' | 'slides';

export interface PreviewCardData {
  type: PreviewCardType;
  title: string;
  description?: string;
  data: WebPreviewData | CodeDiffData | Record<string, unknown>;
}

export interface WebPreviewData {
  url?: string;
  htmlContent?: string;
  artifactId?: string;
  versionId?: string;
}

export interface CodeDiffData {
  approvalId?: string;
  oldCode: string;
  newCode: string;
  language?: string;
  fileName?: string;
}

export interface Session {
  id: string;
  name: string;
  avatar?: string;
  agentIds: string[];
  lastMessage?: string;
  lastActiveAt: string;
  isPinned: boolean;
  isArchived: boolean;
  unreadCount: number;
  type: 'single' | 'group';
}

export interface Approval {
  id: string;
  type: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  conversationId?: string | null;
  updatedAt: string;
}

export interface WorkspaceFile {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  hash: string;
}

export interface CliDiffSummary {
  filePath: string;
  approvalId: string;
  oldCode: string;
  newCode: string;
}
