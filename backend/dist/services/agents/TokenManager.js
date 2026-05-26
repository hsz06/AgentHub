"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenManager = void 0;
class TokenManager {
    constructor() {
        this.modelTokenLimits = {
            'gpt-3.5-turbo': 4096,
            'gpt-4': 8192,
            'gpt-4-turbo': 128000,
            'claude-3-opus': 200000,
            'claude-3-sonnet': 200000,
            'claude-3-haiku': 200000,
        };
    }
    approximateTokenCount(text) {
        if (!text)
            return 0;
        return Math.ceil(text.length / 4);
    }
    calculateMessagesTokens(messages) {
        let totalTokens = 0;
        for (const message of messages) {
            totalTokens += this.approximateTokenCount(message.content);
            totalTokens += 4;
        }
        totalTokens += 3;
        return totalTokens;
    }
    getModelMaxTokens(model) {
        return this.modelTokenLimits[model] ?? 4096;
    }
    truncateMessagesToFit(messages, maxContextTokens, reservedTokensForOutput = 1000) {
        const availableTokens = maxContextTokens - reservedTokensForOutput;
        if (availableTokens <= 0) {
            return [];
        }
        let currentTokens = this.calculateMessagesTokens(messages);
        if (currentTokens <= availableTokens) {
            return [...messages];
        }
        const result = [];
        let tokensSoFar = 0;
        if (messages.length > 0 && messages[0].role === 'system') {
            result.push(messages[0]);
            tokensSoFar = this.calculateMessagesTokens([messages[0]]);
            messages = messages.slice(1);
        }
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const msgTokens = this.calculateMessagesTokens([msg]);
            if (tokensSoFar + msgTokens <= availableTokens) {
                result.unshift(msg);
                tokensSoFar += msgTokens;
            }
            else {
                break;
            }
        }
        return result;
    }
    assembleContext(systemPrompt, historyMessages, newUserMessage, model, reservedTokensForOutput = 1000) {
        const maxTokens = this.getModelMaxTokens(model);
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push(...historyMessages);
        messages.push(newUserMessage);
        return this.truncateMessagesToFit(messages, maxTokens, reservedTokensForOutput);
    }
}
exports.TokenManager = TokenManager;
//# sourceMappingURL=TokenManager.js.map