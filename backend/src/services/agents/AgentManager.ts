import { BaseAgent } from './BaseAgent';
import { OpenAIAgent } from './OpenAIAgent';
import { ClaudeAgent } from './ClaudeAgent';
import { TokenManager } from './TokenManager';

export class AgentManager {
  private static instance: AgentManager;
  private agents: Map<string, BaseAgent>;
  private tokenManager: TokenManager;

  private constructor() {
    this.agents = new Map<string, BaseAgent>();
    this.tokenManager = new TokenManager();
    this.registerDefaultAgents();
  }

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  private registerDefaultAgents(): void {
    try {
      const openAIAgent = new OpenAIAgent();
      this.registerAgent(openAIAgent);
    } catch (e) {
    }
    try {
      const claudeAgent = new ClaudeAgent();
      this.registerAgent(claudeAgent);
    } catch (e) {
    }
  }

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.getAgentName(), agent);
  }

  getAgent(agentName: string): BaseAgent | undefined {
    return this.agents.get(agentName);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getTokenManager(): TokenManager {
    return this.tokenManager;
  }
}
