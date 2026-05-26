"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orchestrator = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const AgentManager_1 = require("./agents/AgentManager");
class Orchestrator {
    constructor() {
        this.agentManager = AgentManager_1.AgentManager.getInstance();
        this.activeOrchestrations = new Map();
    }
    static getInstance() {
        if (!Orchestrator.instance) {
            Orchestrator.instance = new Orchestrator();
        }
        return Orchestrator.instance;
    }
    parseMentionedAgentIds(content) {
        const mentionRegex = /@agent:([a-zA-Z0-9-]+)/g;
        const matches = [];
        let match;
        while ((match = mentionRegex.exec(content)) !== null) {
            matches.push(match[1]);
        }
        return [...new Set(matches)];
    }
    async buildFullContextMessages(conversationId, newUserMessage) {
        const allMessages = await prisma_1.default.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' }
        });
        const pinnedMessages = allMessages.filter(m => m.isPinned);
        const recentMessages = allMessages.slice(-50);
        const contextMessages = [];
        if (pinnedMessages.length > 0) {
            const pinnedContextHeader = {
                role: 'system',
                content: `=== 长期上下文（关键消息，用户已固定）===\n${pinnedMessages.map(m => `[${m.senderType === 'user' ? '用户' : m.senderType === 'agent' ? 'AI' : '系统'}] ${m.content}`).join('\n\n')}\n============================================`
            };
            contextMessages.push(pinnedContextHeader);
        }
        recentMessages.forEach(m => {
            const role = m.senderType === 'user' ? 'user' :
                m.senderType === 'agent' ? 'assistant' : 'system';
            contextMessages.push({
                role,
                content: m.content
            });
        });
        if (newUserMessage) {
            contextMessages.push({
                role: 'user',
                content: newUserMessage
            });
        }
        return contextMessages;
    }
    async analyzeIntent(userMessage, availableAgents) {
        const mentionedIds = this.parseMentionedAgentIds(userMessage);
        const targetAgents = [];
        if (mentionedIds.length > 0) {
            targetAgents.push(...mentionedIds);
        }
        else {
            availableAgents.forEach(agent => {
                targetAgents.push(agent.id);
            });
        }
        return {
            intent: 'collaborative_task',
            confidence: 0.9,
            targetAgents,
            taskDescription: userMessage
        };
    }
    async decomposeTasks(originalMessage, targetAgentIds, conversationId) {
        const tasks = [];
        const agentsInDb = await prisma_1.default.agent.findMany({
            where: { id: { in: targetAgentIds } }
        });
        agentsInDb.forEach((agent, index) => {
            tasks.push({
                id: `task-${Date.now()}-${index}`,
                agentId: agent.id,
                agentName: agent.name,
                description: `Agent ${agent.name} 处理用户请求`,
                status: 'pending',
                inputContext: ''
            });
        });
        return tasks;
    }
    async pushStateUpdate(io, conversationId, state) {
        io.to(`conversation:${conversationId}`).emit('orchestration-state', {
            conversationId,
            tasks: state.tasks,
            currentTaskIndex: state.currentTaskIndex,
            isRunning: state.isRunning
        });
    }
    formatAggregatedResult(tasks) {
        const completedTasks = tasks.filter(t => t.status === 'completed' && t.outputResult);
        if (completedTasks.length === 0) {
            return '没有Agent返回结果';
        }
        let result = '\n=== 多Agent协作结果汇总 ===\n\n';
        completedTasks.forEach((task, idx) => {
            result += `【${idx + 1}. ${task.agentName}】\n${task.outputResult}\n\n`;
        });
        return result;
    }
    async runAgentChain(conversationId, originalUserMessage, tasks, io) {
        const state = {
            conversationId,
            originalMessage: originalUserMessage,
            tasks,
            currentTaskIndex: 0,
            isRunning: true
        };
        this.activeOrchestrations.set(conversationId, state);
        await this.pushStateUpdate(io, conversationId, state);
        const fullHistoryContext = await this.buildFullContextMessages(conversationId);
        let accumulatedContext = `${fullHistoryContext.map(m => `[${m.role}] ${m.content}`).join('\n\n')}\n\n新请求：${originalUserMessage}`;
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            state.currentTaskIndex = i;
            task.status = 'running';
            task.inputContext = accumulatedContext;
            await this.pushStateUpdate(io, conversationId, state);
            try {
                const agentFromDb = await prisma_1.default.agent.findUnique({
                    where: { id: task.agentId }
                });
                if (!agentFromDb) {
                    task.status = 'failed';
                    task.outputResult = 'Agent not found in database';
                    continue;
                }
                const runtimeAgent = this.agentManager.getAgent(agentFromDb.name);
                if (!runtimeAgent) {
                    task.status = 'failed';
                    task.outputResult = `Agent runtime instance [${agentFromDb.name}] not available`;
                    continue;
                }
                const messages = await this.buildFullContextMessages(conversationId, accumulatedContext);
                const agentOutput = await runtimeAgent.normalChat(messages);
                task.status = 'completed';
                task.outputResult = agentOutput;
                accumulatedContext = `${accumulatedContext}\n\n--- 上一Agent输出 (${task.agentName}) ---\n${agentOutput}`;
            }
            catch (err) {
                task.status = 'failed';
                task.outputResult = `Agent execution failed: ${String(err)}`;
            }
            await this.pushStateUpdate(io, conversationId, state);
        }
        state.isRunning = false;
        await this.pushStateUpdate(io, conversationId, state);
        this.activeOrchestrations.delete(conversationId);
        return this.formatAggregatedResult(tasks);
    }
    async processGroupConversation(conversationId, userMessage, io) {
        const conversationWithMembers = await prisma_1.default.conversation.findUnique({
            where: { id: conversationId },
            include: {
                members: { include: { agent: true } }
            }
        });
        if (!conversationWithMembers) {
            throw new Error('Conversation not found');
        }
        const mentionedAgentIds = this.parseMentionedAgentIds(userMessage);
        let targetAgentsDb;
        if (mentionedAgentIds.length > 0) {
            targetAgentsDb = conversationWithMembers.members
                .map(m => m.agent)
                .filter(a => mentionedAgentIds.includes(a.id));
        }
        else {
            targetAgentsDb = conversationWithMembers.members.map(m => m.agent);
        }
        const intentResult = await this.analyzeIntent(userMessage, targetAgentsDb);
        const tasks = await this.decomposeTasks(userMessage, intentResult.targetAgents, conversationId);
        return this.runAgentChain(conversationId, userMessage, tasks, io);
    }
}
exports.Orchestrator = Orchestrator;
//# sourceMappingURL=Orchestrator.js.map