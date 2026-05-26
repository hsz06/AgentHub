import { setTimeout } from 'timers/promises';

export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export class RetryHandler {
  private maxRetries: number;
  private initialDelayMs: number;
  private maxDelayMs: number;
  private backoffFactor: number;

  constructor(config: RetryConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3;
    this.initialDelayMs = config.initialDelayMs ?? 1000;
    this.maxDelayMs = config.maxDelayMs ?? 10000;
    this.backoffFactor = config.backoffFactor ?? 2;
  }

  private isRetryableError(error: any): boolean {
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

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (attempt >= this.maxRetries || !this.isRetryableError(error)) {
          throw error;
        }
        const delay = Math.min(
          this.initialDelayMs * Math.pow(this.backoffFactor, attempt),
          this.maxDelayMs
        );
        await setTimeout(delay);
      }
    }
    throw lastError;
  }
}
