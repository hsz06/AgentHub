"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeAgent = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const BaseAgent_1 = require("./BaseAgent");
const RetryHandler_1 = require("./RetryHandler");
class ClaudeAgent extends BaseAgent_1.BaseAgent {
    constructor(apiKey, defaultModel = 'claude-3-sonnet-20240229') {
        super('claude', defaultModel);
        this.client = new sdk_1.default({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        });
        this.retryHandler = new RetryHandler_1.RetryHandler();
    }
    convertMessagesToAnthropic(messages) {
        let system;
        const convertedMessages = [];
        for (const msg of messages) {
            if (msg.role === 'system') {
                system = msg.content;
            }
            else {
                convertedMessages.push({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: msg.content,
                });
            }
        }
        return { system, messages: convertedMessages };
    }
    async normalChat(messages, options) {
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
    async streamChat(messages, socket, roomId, options) {
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
exports.ClaudeAgent = ClaudeAgent;
//# sourceMappingURL=ClaudeAgent.js.map