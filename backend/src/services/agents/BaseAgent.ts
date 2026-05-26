import { Server as SocketIOServer } from 'socket.io';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export abstract class BaseAgent {
  protected agentName: string;
  protected defaultModel: string;

  constructor(agentName: string, defaultModel: string) {
    this.agentName = agentName;
    this.defaultModel = defaultModel;
  }

  getAgentName(): string {
    return this.agentName;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  abstract normalChat(messages: Message[], options?: ChatOptions): Promise<string>;

  abstract streamChat(
    messages: Message[],
    socket: SocketIOServer,
    roomId: string,
    options?: ChatOptions
  ): Promise<void>;
}
