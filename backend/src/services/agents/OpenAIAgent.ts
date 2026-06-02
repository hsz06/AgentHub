import OpenAI from 'openai'
import { BaseAgent, ChatOptions, Message } from './BaseAgent'
import { RetryHandler } from './RetryHandler'

export class OpenAIAgent extends BaseAgent {
  private client: OpenAI
  private retryHandler = new RetryHandler()

  constructor(apiKey: string, baseURL?: string, defaultModel = 'gpt-4o-mini') {
    super('openai', defaultModel)
    this.client = new OpenAI({ apiKey, baseURL: baseURL || process.env.OPENAI_BASE_URL })
  }

  async normalChat(messages: Message[], options?: ChatOptions): Promise<string> {
    return this.retryHandler.execute(async () => {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens
      })
      return response.choices[0]?.message.content || ''
    })
  }

  async streamChat(messages: Message[], onChunk: (chunk: string) => void, options?: ChatOptions): Promise<string> {
    return this.retryHandler.execute(async () => {
      const stream = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        stream: true
      })
      let output = ''
      for await (const part of stream) {
        const chunk = part.choices[0]?.delta.content || ''
        if (chunk) {
          output += chunk
          onChunk(chunk)
        }
      }
      return output
    })
  }
}

