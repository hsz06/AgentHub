import Anthropic from '@anthropic-ai/sdk'
import { BaseAgent, ChatOptions, Message } from './BaseAgent'
import { RetryHandler } from './RetryHandler'

export class ClaudeAgent extends BaseAgent {
  private client: Anthropic
  private retryHandler = new RetryHandler()

  constructor(apiKey: string, defaultModel = 'claude-3-5-sonnet-latest') {
    super('claude', defaultModel)
    this.client = new Anthropic({ apiKey })
  }

  private convert(messages: Message[]) {
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n') || undefined
    const converted = messages.filter(message => message.role !== 'system').map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content
    }))
    return { system, messages: converted }
  }

  async normalChat(messages: Message[], options?: ChatOptions): Promise<string> {
    return this.retryHandler.execute(async () => {
      const converted = this.convert(messages)
      const response = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        ...converted
      })
      return response.content[0]?.type === 'text' ? response.content[0].text : ''
    })
  }

  async streamChat(messages: Message[], onChunk: (chunk: string) => void, options?: ChatOptions): Promise<string> {
    return this.retryHandler.execute(async () => {
      const converted = this.convert(messages)
      const stream = this.client.messages.stream({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        ...converted
      })
      let output = ''
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          output += event.delta.text
          onChunk(event.delta.text)
        }
      }
      return output
    })
  }
}

