import Anthropic from '@anthropic-ai/sdk';
import { Server as SocketIOServer } from 'socket.io';
import { BaseAgent, Message, ChatOptions } from './BaseAgent';
import { RetryHandler } from './RetryHandler';

export class ClaudeAgent extends BaseAgent {
  private client: Anthropic;
  private retryHandler: RetryHandler;

  constructor(apiKey?: string, defaultModel: string = 'claude-3-sonnet-20240229') {
    super('claude', defaultModel);
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.retryHandler = new RetryHandler();
  }

  private convertMessagesToAnthropic(messages: Message[]): { system?: string; messages: Anthropic.MessageParam[] } {
    let system: string | undefined;
    const convertedMessages: Anthropic.MessageParam[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else {
        convertedMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }
    return { system, messages: convertedMessages };
  }

  override async normalChat(messages: Message[], options?: ChatOptions): Promise<string> {
    return this.retryHandler.execute(async () => {
      const { system, messages: anthropicMessages } = this.convertMessagesToAnthropic(messages);
      const response = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        system,
        messages: anthropicMessages,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP ?? 1,
      });
      return response.content[0]?.type === 'text' ? response.content[0].text : '';
    });
  }

  override async streamChat(
    messages: Message[],
    socket: SocketIOServer,
    roomId: string,
    options?: ChatOptions
  ): Promise<void> {
    await this.retryHandler.execute(async () => {
      const { system, messages: anthropicMessages } = this.convertMessagesToAnthropic(messages);
      const stream = this.client.messages.stream({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        system,
        messages: anthropicMessages,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP ?? 1,
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          socket.to(roomId).emit('agent-chunk', { content: event.delta.text });
        }
      }
      socket.to(roomId).emit('agent-done');
    });
  }
}
