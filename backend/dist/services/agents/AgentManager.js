"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentManager = void 0;
const OpenAIAgent_1 = require("./OpenAIAgent");
const ClaudeAgent_1 = require("./ClaudeAgent");
const TokenManager_1 = require("./TokenManager");
class AgentManager {
    constructor() {
        this.agents = new Map();
        this.tokenManager = new TokenManager_1.TokenManager();
        this.registerDefaultAgents();
    }
    static getInstance() {
        if (!AgentManager.instance) {
            AgentManager.instance = new AgentManager();
        }
        return AgentManager.instance;
    }
    registerDefaultAgents() {
        try {
            const openAIAgent = new OpenAIAgent_1.OpenAIAgent();
            this.registerAgent(openAIAgent);
        }
        catch (e) {
        }
        try {
            const claudeAgent = new ClaudeAgent_1.ClaudeAgent();
            this.registerAgent(claudeAgent);
        }
        catch (e) {
        }
    }
    registerAgent(agent) {
        this.agents.set(agent.getAgentName(), agent);
    }
    getAgent(agentName) {
        return this.agents.get(agentName);
    }
    getAllAgents() {
        return Array.from(this.agents.values());
    }
    getTokenManager() {
        return this.tokenManager;
    }
}
exports.AgentManager = AgentManager;
//# sourceMappingURL=AgentManager.js.map