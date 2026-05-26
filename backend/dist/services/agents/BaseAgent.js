"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgent = void 0;
class BaseAgent {
    constructor(agentName, defaultModel) {
        this.agentName = agentName;
        this.defaultModel = defaultModel;
    }
    getAgentName() {
        return this.agentName;
    }
    getDefaultModel() {
        return this.defaultModel;
    }
}
exports.BaseAgent = BaseAgent;
//# sourceMappingURL=BaseAgent.js.map