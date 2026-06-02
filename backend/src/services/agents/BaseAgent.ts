export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  conversationId?: string
  workspaceId?: string
  agentId?: string
  messageId?: string
}

export abstract class BaseAgent {
  constructor(protected agentName: string, protected defaultModel: string) {}

  getAgentName() {
    return this.agentName
  }

  getDefaultModel() {
    return this.defaultModel
  }

  abstract normalChat(messages: Message[], options?: ChatOptions): Promise<string>
  abstract streamChat(messages: Message[], onChunk: (chunk: string) => void, options?: ChatOptions): Promise<string>
}
