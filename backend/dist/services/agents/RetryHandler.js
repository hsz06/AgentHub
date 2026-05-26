"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryHandler = void 0;
const promises_1 = require("timers/promises");
class RetryHandler {
    constructor(config = {}) {
        this.maxRetries = config.maxRetries ?? 3;
        this.initialDelayMs = config.initialDelayMs ?? 1000;
        this.maxDelayMs = config.maxDelayMs ?? 10000;
        this.backoffFactor = config.backoffFactor ?? 2;
    }
    isRetryableError(error) {
        const retryableStatusCodes = [429, 500, 502, 503, 504];
        if (error?.status && retryableStatusCodes.includes(error.status)) {
            return true;
        }
        if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ECONNABORTED') {
            return true;
        }
        if (error?.message?.includes('rate limit') || error?.message?.includes('timeout')) {
            return true;
        }
        return false;
    }
    async execute(fn) {
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                if (attempt >= this.maxRetries || !this.isRetryableError(error)) {
                    throw error;
                }
                const delay = Math.min(this.initialDelayMs * Math.pow(this.backoffFactor, attempt), this.maxDelayMs);
                await (0, promises_1.setTimeout)(delay);
            }
        }
        throw lastError;
    }
}
exports.RetryHandler = RetryHandler;
//# sourceMappingURL=RetryHandler.js.map