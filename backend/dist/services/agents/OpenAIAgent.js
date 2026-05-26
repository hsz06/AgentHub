"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIAgent = void 0;
const openai_1 = __importDefault(require("openai"));
const BaseAgent_1 = require("./BaseAgent");
const RetryHandler_1 = require("./RetryHandler");
class OpenAIAgent extends BaseAgent_1.BaseAgent {
    constructor(apiKey, baseURL, defaultModel = 'gpt-4') {
        super('openai', defaultModel);
        this.client = new openai_1.default({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
            baseURL: baseURL || process.env.OPENAI_BASE_URL,
        });
        this.retryHandler = new RetryHandler_1.RetryHandler();
    }
    async normalChat(messages, options) {
        return this.retryHandler.execute(async () => {
            const response = await this.client.chat.completions.create({
                model: options?.model || this.defaultModel,
                messages: messages,
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens,
                top_p: options?.topP ?? 1,
                frequency_penalty: options?.frequencyPenalty ?? 0,
                presence_penalty: options?.presencePenalty ?? 0,
            });
            return response.choices[0]?.message?.content || '';
        });
    }
    async streamChat(messages, socket, roomId, options) {
        await this.retryHandler.execute(async () => {
            const stream = await this.client.chat.completions.create({
                model: options?.model || this.defaultModel,
                messages: messages,
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
exports.OpenAIAgent = OpenAIAgent;
//# sourceMappingURL=OpenAIAgent.js.map