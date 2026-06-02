import { Agent } from '@prisma/client'
import { Server } from 'socket.io'
import prisma from '../utils/prisma'
import { buildContext } from './ContextService'
import { AgentManager } from './agents/AgentManager'
import { attachGeneratedArtifacts, executeReadToolRequests } from './ArtifactExtractionService'

interface PlannedTask {
  key: string
  title: string
  agentId: string
  input: string
  dependencies: string[]
}

export class Orchestrator {
  private static instance: Orchestrator
  private manager = AgentManager.getInstance()
  private cancelled = new Set<string>()

  static getInstance() {
    if (!Orchestrator.instance) Orchestrator.instance = new Orchestrator()
    return Orchestrator.instance
  }

  async cancel(userId: string, conversationId: string) {
    const run = await prisma.orchestrationRun.findFirst({ where: { userId, conversationId, status: { in: ['planning', 'running', 'waiting_approval'] } }, orderBy: { createdAt: 'desc' } })
    if (!run) return null
    this.cancelled.add(run.id)
    await prisma.orchestrationTask.updateMany({ where: { runId: run.id, status: { in: ['pending', 'running', 'waiting_approval'] } }, data: { status: 'cancelled', completedAt: new Date() } })
    return prisma.orchestrationRun.update({ where: { id: run.id }, data: { status: 'cancelled', completedAt: new Date() } })
  }

  async processGroupConversation(userId: string, conversationId: string, mentionedAgentIds: string[], io: Server) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { members: { include: { agent: true } }, messages: { where: { senderType: 'user' }, orderBy: { createdAt: 'desc' }, take: 1 } }
    })
    if (!conversation) throw new Error('Conversation not found')
    const agents = mentionedAgentIds.length
      ? conversation.members.map(member => member.agent).filter(agent => mentionedAgentIds.includes(agent.id))
      : conversation.members.map(member => member.agent)
    if (!agents.length) throw new Error('No addressed agents in this conversation')
    const request = conversation.messages[0]?.content || 'Collaborate on the latest user request.'
    const run = await prisma.orchestrationRun.create({
      data: { userId, conversationId, mode: 'graph', status: 'planning', request, state: '{}' }
    })
    const room = `conversation:${conversationId}`
    io.to(room).emit('orchestration:state', { runId: run.id, status: 'planning' })
    const planned = await this.plan(userId, agents, request)
    const tasks = await Promise.all(planned.map(task => prisma.orchestrationTask.create({
      data: { runId: run.id, agentId: task.agentId, title: task.title, input: task.input, dependencies: JSON.stringify(task.dependencies) }
    })))
    const taskIdsByKey = new Map(planned.map((task, index) => [task.key, tasks[index].id]))
    await prisma.orchestrationRun.update({
      where: { id: run.id },
      data: { status: 'running', state: JSON.stringify({ plan: planned, taskIdsByKey: Object.fromEntries(taskIdsByKey) }) }
    })
    io.to(room).emit('orchestration:state', { runId: run.id, status: 'running', tasks })

    const completed = new Map<string, string>()
    const failed = new Set<string>()
    const remaining = new Set(planned.map(task => task.key))
    let waitingApproval = false
    while (remaining.size && !this.cancelled.has(run.id)) {
      const ready = planned.filter(task => remaining.has(task.key) && task.dependencies.every(dependency => completed.has(dependency) || failed.has(dependency)))
      if (!ready.length) {
        for (const key of remaining) failed.add(key)
        break
      }
      const results = await Promise.all(ready.map(task => this.executeTask(userId, conversationId, run.id, taskIdsByKey.get(task.key)!, task, agents, completed, io)))
      results.forEach((result, index) => {
        const key = ready[index].key
        remaining.delete(key)
        if (result.status === 'failed') failed.add(key)
        else completed.set(key, result.output)
        if (result.status === 'waiting_approval') waitingApproval = true
      })
    }
    if (this.cancelled.delete(run.id)) {
      io.to(room).emit('orchestration:state', { runId: run.id, status: 'cancelled' })
      return
    }
    if (waitingApproval) {
      await prisma.orchestrationRun.update({ where: { id: run.id }, data: { status: 'waiting_approval', result: Array.from(completed.values()).join('\n\n') } })
      io.to(room).emit('orchestration:state', { runId: run.id, status: 'waiting_approval' })
      return
    }
    await this.summarize(userId, conversationId, run.id, agents[0], completed, failed, io)
  }

  private async plan(userId: string, agents: Agent[], request: string): Promise<PlannedTask[]> {
    try {
      const planner = await this.manager.createRuntimeAgent(agents[0], userId)
      const response = await planner.normalChat([{
        role: 'user',
        content: `Create a compact execution graph for this request: ${request}\nAvailable agents: ${agents.map(agent => `${agent.id}:${agent.name}`).join(', ')}.\nReturn only JSON: {"tasks":[{"key":"t1","title":"...","agentId":"...","input":"...","dependencies":[]}]}. Independent work should have no dependencies.`
      }], { model: agents[0].model || undefined, maxTokens: 800, temperature: 0 })
      const parsed = JSON.parse(response.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()) as { tasks?: PlannedTask[] }
      const permitted = new Set(agents.map(agent => agent.id))
      const tasks = (parsed.tasks || []).filter(task => task.key && permitted.has(task.agentId) && Array.isArray(task.dependencies))
      if (tasks.length) return tasks.map(task => ({ ...task, dependencies: task.dependencies.filter(dependency => dependency !== task.key) }))
    } catch {
      // A deterministic fallback still permits the group chat to work when planning is unavailable.
    }
    return agents.map((agent, index) => ({
      key: `t${index + 1}`,
      title: `${agent.name} contribution`,
      agentId: agent.id,
      input: request,
      dependencies: []
    }))
  }

  private async executeTask(
    userId: string,
    conversationId: string,
    runId: string,
    taskId: string,
    plan: PlannedTask,
    agents: Agent[],
    outputs: Map<string, string>,
    io: Server
  ) {
    const task = await prisma.orchestrationTask.findUniqueOrThrow({ where: { id: taskId } })
    const agent = agents.find(item => item.id === plan.agentId)!
    const room = `conversation:${conversationId}`
    await prisma.orchestrationTask.update({ where: { id: task.id }, data: { status: 'running', startedAt: new Date() } })
    io.to(room).emit('task:state', { runId, taskId: task.id, agentId: agent.id, title: task.title, status: 'running' })
    const placeholder = await prisma.message.create({
      data: { conversationId, senderType: 'agent', senderId: agent.id, agentId: agent.id, content: '', messageType: 'text', status: 'streaming' }
    })
    io.to(room).emit('message:created', placeholder)
    try {
      const runtime = await this.manager.createRuntimeAgent(agent, userId)
      const context = await buildContext(conversationId, agent)
      const dependencyContext = plan.dependencies.map(key => outputs.get(key)).filter(Boolean).join('\n\n')
      context.push({ role: 'user', content: `Your assigned task: ${plan.input}${dependencyContext ? `\nInputs from dependencies:\n${dependencyContext}` : ''}` })
      const workspace = await prisma.workspace.findFirst({ where: { userId, conversationId }, orderBy: { updatedAt: 'desc' } })
      let output = await runtime.streamChat(context, chunk => {
        if (!this.cancelled.has(runId)) io.to(room).emit('message:chunk', { messageId: placeholder.id, conversationId, chunk })
      }, { model: agent.model || undefined, conversationId, workspaceId: workspace?.id, agentId: agent.id, messageId: placeholder.id })
      if (this.cancelled.has(runId)) return { status: 'cancelled', output: '' }
      const allowedTools = JSON.parse(agent.tools || '[]') as string[]
      const readResult = await executeReadToolRequests(userId, output, allowedTools)
      if (readResult) {
        context.push({ role: 'assistant', content: output }, { role: 'user', content: readResult })
        output += `\n\n${await runtime.streamChat(context, chunk => {
          if (!this.cancelled.has(runId)) io.to(room).emit('message:chunk', { messageId: placeholder.id, conversationId, chunk })
        }, { model: agent.model || undefined, conversationId, workspaceId: workspace?.id, agentId: agent.id, messageId: placeholder.id })}`
      }
      let finalMessage = await prisma.message.update({ where: { id: placeholder.id }, data: { content: output, status: 'completed' } })
      const attached = await attachGeneratedArtifacts(userId, finalMessage.id, output, { conversationId, agentId: agent.id, runId, taskId: task.id, allowedTools })
      finalMessage = attached.message || finalMessage
      const cliApprovals = await prisma.toolApproval.count({
        where: { userId, status: 'pending', payload: { contains: `"cliRunId"` }, workspace: { conversationId } }
      })
      const status = attached.approvalCreated || cliApprovals > 0 ? 'waiting_approval' : 'completed'
      await prisma.orchestrationTask.update({ where: { id: task.id }, data: { status, output, completedAt: status === 'completed' ? new Date() : null } })
      io.to(room).emit('message:completed', finalMessage)
      io.to(room).emit('task:state', { runId, taskId: task.id, agentId: agent.id, title: task.title, status })
      return { status, output }
    } catch (error) {
      const output = `Agent response failed: ${error instanceof Error ? error.message : String(error)}`
      await prisma.orchestrationTask.update({ where: { id: task.id }, data: { status: 'failed', output, completedAt: new Date() } })
      const failedMessage = await prisma.message.update({ where: { id: placeholder.id }, data: { content: output, status: 'failed' } })
      io.to(room).emit('message:completed', failedMessage)
      io.to(room).emit('task:state', { runId, taskId: task.id, agentId: agent.id, title: task.title, status: 'failed' })
      return { status: 'failed', output }
    }
  }

  async resumeAfterApproval(userId: string, runId: string, io: Server) {
    const run = await prisma.orchestrationRun.findFirst({
      where: { id: runId, userId },
      include: { conversation: { include: { members: { include: { agent: true } } } }, tasks: true }
    })
    if (!run || run.status !== 'waiting_approval') return
    const waiting = run.tasks.filter(task => task.status === 'waiting_approval')
    if (waiting.length) return
    const outputs = new Map(run.tasks.filter(task => task.output).map(task => [task.id, task.output!]))
    const failed = new Set(run.tasks.filter(task => task.status === 'failed').map(task => task.id))
    await this.summarize(userId, run.conversationId, run.id, run.conversation.members[0].agent, outputs, failed, io)
  }

  private async summarize(userId: string, conversationId: string, runId: string, agent: Agent, completed: Map<string, string>, failed: Set<string>, io: Server) {
    let summary = `Collaboration completed. ${failed.size ? `${failed.size} task(s) failed.` : 'All tasks completed.'}\n\n${Array.from(completed.values()).join('\n\n')}`
    try {
      const runtime = await this.manager.createRuntimeAgent(agent, userId)
      summary = await runtime.normalChat([{
        role: 'user',
        content: `Summarize these collaboration results for the user. Mention failed tasks clearly.\n${Array.from(completed.values()).join('\n\n')}\nFailed task count: ${failed.size}`
      }], { model: agent.model || undefined, maxTokens: 1000 })
    } catch {
      // Preserve a persisted aggregate even if the final model call is unavailable.
    }
    const message = await prisma.message.create({
      data: { conversationId, senderType: 'system', senderId: agent.id, agentId: agent.id, content: summary, messageType: 'text', status: 'completed' }
    })
    await prisma.orchestrationRun.update({ where: { id: runId }, data: { status: failed.size ? 'completed_with_errors' : 'completed', result: summary, completedAt: new Date() } })
    io.to(`conversation:${conversationId}`).emit('message:created', message)
    io.to(`conversation:${conversationId}`).emit('orchestration:state', { runId, status: failed.size ? 'completed_with_errors' : 'completed' })
  }
}
