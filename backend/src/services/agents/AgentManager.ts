import { Agent } from '@prisma/client'
import { getProviderRuntimeConfig, Provider } from '../../controllers/SettingsController'
import { BaseAgent } from './BaseAgent'
import { ClaudeAgent } from './ClaudeAgent'
import { CliAgent, isCliAdapter } from './CliAgent'
import { OpenAIAgent } from './OpenAIAgent'
import { TokenManager } from './TokenManager'

export class AgentManager {
  private static instance: AgentManager
  private tokenManager = new TokenManager()

  static getInstance() {
    if (!AgentManager.instance) AgentManager.instance = new AgentManager()
    return AgentManager.instance
  }

  async createRuntimeAgent(agent: Agent, userId: string): Promise<BaseAgent> {
    if (agent.adapterType === 'openai' || agent.adapterType === 'mimo') {
      const provider = agent.adapterType as Provider
      const config = await getProviderRuntimeConfig(userId, provider)
      if (!config.apiKey) throw new Error(`Configure a ${provider === 'mimo' ? 'MiMo' : 'OpenAI'} API key before using this Agent`)
      return new OpenAIAgent(config.apiKey, config.baseURL, agent.model || config.model)
    }
    if (agent.adapterType === 'claude') {
      const config = await getProviderRuntimeConfig(userId, 'anthropic')
      if (!config.apiKey) throw new Error('Configure an Anthropic API key before using this Agent')
      return new ClaudeAgent(config.apiKey, agent.model || config.model)
    }
    if (isCliAdapter(agent.adapterType)) {
      return new CliAgent(agent, userId)
    }
    throw new Error(`Unsupported Agent adapter: ${agent.adapterType}`)
  }

  getTokenManager() {
    return this.tokenManager
  }

  async initializeFromDatabase() {
    // Runtime clients are created per user request so user BYOK never enters shared state.
  }
}
