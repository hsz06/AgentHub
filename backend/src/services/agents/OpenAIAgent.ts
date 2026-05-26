import OpenAI from 'openai';
import { Server as SocketIOServer } from 'socket.io';
import { BaseAgent, Message, ChatOptions } from './BaseAgent';
import { RetryHandler } from './RetryHandler';

export class OpenAIAgent extends BaseAgent {
  private client: OpenAI;
  private retryHandler: RetryHandler;

  constructor(apiKey?: string, baseURL?: string, defaultModel: string = 'gpt-4') {
    super('openai', defaultModel);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      baseURL: baseURL || process.env.OPENAI_BASE_URL,
    });
    this.retryHandler = new RetryHandler();
  }

  override async normalChat(messages: Message[], options?: ChatOptions): Promise<string> {
    return this.retryHandler.execute(async () => {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP ?? 1,
        frequency_penalty: options?.frequencyPenalty ?? 0,
        presence_penalty: options?.presencePenalty ?? 0,
      });
      return response.choices[0]?.message?.content || '';
    });
  }

  override async streamChat(
    messages: Message[],
    socket: SocketIOServer,
    roomId: string,
    options?: ChatOptions
  ): Promise<void> {
    await this.retryHandler.execute(async () => {
      const stream = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP ?? 1,
        frequency_penalty: options?.frequencyPenalty ?? 0,
        presence_penalty: options?.presencePenalty ?? 0,
        stream: true,
      });
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          socket.to(roomId).emit('agent-chunk', { content });
        }
      }
      socket.to(roomId).emit('agent-done');
    });
  }
}
