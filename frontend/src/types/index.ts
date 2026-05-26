import type { ReactNode } from 'react';

export interface Agent {
  id: string;
  name: string;
  description: string;
  tags: string[];
  iconType: string;
  color: string;
}

export interface Message {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'user' | 'agent';
  createdAt: string;
  isPinned?: boolean;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  preview_cards?: PreviewCardData[];
}

export type PreviewCardType = 'web-preview' | 'code-diff' | 'image' | 'file-attachment' | 'deployment-status';

export interface PreviewCardData {
  type: PreviewCardType;
  title: string;
  description?: string;
  data: WebPreviewData | CodeDiffData | any;
}

export interface WebPreviewData {
  url?: string;
  htmlContent?: string;
}

export interface CodeDiffData {
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
  type?: 'single' | 'group';
}
