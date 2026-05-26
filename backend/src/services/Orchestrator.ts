import { Server as SocketIOServer } from 'socket.io'
import prisma from '../utils/prisma'
import { AgentManager } from './agents/AgentManager'
import { BaseAgent, Message } from './agents/BaseAgent'

export interface IntentAnalysisResult {
  intent: string
  confidence: number
  targetAgents: string[]
  taskDescription: string
}

export interface SubTask {
  id: string
  agentId: string
  agentName: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  inputContext: string
  outputResult?: string
}

export interface OrchestrationState {
  conversationId: string
  originalMessage: string
  tasks: SubTask[]
  currentTaskIndex: number
  isRunning: boolean
}

export class Orchestrator {
  private static instance: Orchestrator
  private agentManager: AgentManager
  private activeOrchestrations: Map<string, OrchestrationState>

  private constructor() {
    this.agentManager = AgentManager.getInstance()
    this.activeOrchestrations = new Map()
  }

  static getInstance(): Orchestrator {
    if (!Orchestrator.instance) {
      Orchestrator.instance = new Orchestrator()
    }
    return Orchestrator.instance
  }

  parseMentionedAgentIds(content: string): string[] {
    const mentionRegex = /@agent:([a-zA-Z0-9-]+)/g
    const matches: string[] = []
    let match
    while ((match = mentionRegex.exec(content)) !== null) {
      matches.push(match[1])
    }
    return [...new Set(matches)]
  }

  async buildFullContextMessages(conversationId: string, newUserMessage?: string): Promise<Message[]> {
    const allMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    })

    const pinnedMessages = allMessages.filter(m => m.isPinned)
    const recentMessages = allMessages.slice(-50)

    const contextMessages: Message[] = []

    if (pinnedMessages.length > 0) {
      const pinnedContextHeader: Message = {
        role: 'system',
        content: `=== 长期上下文（关键消息，用户已固定）===\n${pinnedMessages.map(m => 
          `[${m.senderType === 'user' ? '用户' : m.senderType === 'agent' ? 'AI' : '系统'}] ${m.content}`
        ).join('\n\n')}\n============================================`
      }
      contextMessages.push(pinnedContextHeader)
    }

    recentMessages.forEach(m => {
      const role: 'user' | 'assistant' | 'system' = 
        m.senderType === 'user' ? 'user' : 
        m.senderType === 'agent' ? 'assistant' : 'system'
      
      contextMessages.push({
        role,
        content: m.content
      })
    })

    if (newUserMessage) {
      contextMessages.push({
        role: 'user',
        content: newUserMessage
      })
    }

    return contextMessages
  }

  async analyzeIntent(userMessage: string, availableAgents: any[]): Promise<IntentAnalysisResult> {
    const mentionedIds = this.parseMentionedAgentIds(userMessage)
    const targetAgents: string[] = []

    if (mentionedIds.length > 0) {
      targetAgents.push(...mentionedIds)
    } else {
      availableAgents.forEach(agent => {
        targetAgents.push(agent.id)
      })
    }

    return {
      intent: 'collaborative_task',
      confidence: 0.9,
      targetAgents,
      taskDescription: userMessage
    }
  }

  async decomposeTasks(
    originalMessage: string,
    targetAgentIds: string[],
    conversationId: string
  ): Promise<SubTask[]> {
    const tasks: SubTask[] = []
    const agentsInDb = await prisma.agent.findMany({
      where: { id: { in: targetAgentIds } }
    })

    agentsInDb.forEach((agent, index) => {
      tasks.push({
        id: `task-${Date.now()}-${index}`,
        agentId: agent.id,
        agentName: agent.name,
        description: `Agent ${agent.name} 处理用户请求`,
        status: 'pending',
        inputContext: ''
      })
    })

    return tasks
  }

  async pushStateUpdate(io: SocketIOServer, conversationId: string, state: OrchestrationState) {
    io.to(`conversation:${conversationId}`).emit('orchestration-state', {
      conversationId,
      tasks: state.tasks,
      currentTaskIndex: state.currentTaskIndex,
      isRunning: state.isRunning
    })
  }

  formatAggregatedResult(tasks: SubTask[]): string {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.outputResult)
    if (completedTasks.length === 0) {
      return '没有Agent返回结果'
    }

    let result = '\n=== 多Agent协作结果汇总 ===\n\n'
    completedTasks.forEach((task, idx) => {
      result += `【${idx + 1}. ${task.agentName}】\n${task.outputResult}\n\n`
    })
    return result
  }

  async runAgentChain(
    conversationId: string,
    originalUserMessage: string,
    tasks: SubTask[],
    io: SocketIOServer
  ): Promise<string> {
    const state: OrchestrationState = {
      conversationId,
      originalMessage: originalUserMessage,
      tasks,
      currentTaskIndex: 0,
      isRunning: true
    }
    this.activeOrchestrations.set(conversationId, state)
    await this.pushStateUpdate(io, conversationId, state)

    const fullHistoryContext = await this.buildFullContextMessages(conversationId)
    let accumulatedContext = `${fullHistoryContext.map(m => `[${m.role}] ${m.content}`).join('\n\n')}\n\n新请求：${originalUserMessage}`

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      state.currentTaskIndex = i
      task.status = 'running'
      task.inputContext = accumulatedContext
      await this.pushStateUpdate(io, conversationId, state)

      try {
        const agentFromDb = await prisma.agent.findUnique({
          where: { id: task.agentId }
        })
        if (!agentFromDb) {
          task.status = 'failed'
          task.outputResult = 'Agent not found in database'
          continue
        }

        const runtimeAgent = this.agentManager.getAgent(agentFromDb.name)
        if (!runtimeAgent) {
          task.status = 'failed'
          task.outputResult = `Agent runtime instance [${agentFromDb.name}] not available`
          continue
        }

        const messages: Message[] = await this.buildFullContextMessages(conversationId, accumulatedContext)

        const agentOutput = await runtimeAgent.normalChat(messages)
        task.status = 'completed'
        task.outputResult = agentOutput

        accumulatedContext = `${accumulatedContext}\n\n--- 上一Agent输出 (${task.agentName}) ---\n${agentOutput}`
      } catch (err) {
        task.status = 'failed'
        task.outputResult = `Agent execution failed: ${String(err)}`
      }

      await this.pushStateUpdate(io, conversationId, state)
    }

    state.isRunning = false
    await this.pushStateUpdate(io, conversationId, state)
    this.activeOrchestrations.delete(conversationId)

    return this.formatAggregatedResult(tasks)
  }

  async processGroupConversation(
    conversationId: string,
    userMessage: string,
    io: SocketIOServer
  ): Promise<string> {
    const conversationWithMembers = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: { include: { agent: true } }
      }
    })
    if (!conversationWithMembers) {
      throw new Error('Conversation not found')
    }

    const mentionedAgentIds = this.parseMentionedAgentIds(userMessage)
    let targetAgentsDb: any[]

    if (mentionedAgentIds.length > 0) {
      targetAgentsDb = conversationWithMembers.members
        .map(m => m.agent)
        .filter(a => mentionedAgentIds.includes(a.id))
    } else {
      targetAgentsDb = conversationWithMembers.members.map(m => m.agent)
    }

    const intentResult = await this.analyzeIntent(userMessage, targetAgentsDb)
    const tasks = await this.decomposeTasks(userMessage, intentResult.targetAgents, conversationId)
    return this.runAgentChain(conversationId, userMessage, tasks, io)
  }
}
