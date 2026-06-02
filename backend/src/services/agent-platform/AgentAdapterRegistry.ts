import { AgentAdapter, AgentProvider } from './types'
import { ClaudeCodeAdapter } from './ClaudeCodeAdapter'
import { CodexAdapter } from './CodexAdapter'
import { OpenCodeAdapter } from './OpenCodeAdapter'

export class AgentAdapterRegistry {
  private adapters = new Map<AgentProvider, AgentAdapter>()

  constructor() {
    this.register(new ClaudeCodeAdapter())
    this.register(new CodexAdapter())
    this.register(new OpenCodeAdapter())
  }

  register(adapter: AgentAdapter) {
    this.adapters.set(adapter.provider, adapter)
  }

  get(provider: AgentProvider) {
    const adapter = this.adapters.get(provider)
    if (!adapter) throw new Error(`Unsupported Agent provider: ${provider}`)
    return adapter
  }
}

export const agentAdapterRegistry = new AgentAdapterRegistry()
