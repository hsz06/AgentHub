import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import prisma from '../utils/prisma'
import { verifyToken } from '../middleware/auth'
import { buildContext } from '../services/ContextService'
import { AgentManager } from '../services/agents/AgentManager'
import { Orchestrator } from '../services/Orchestrator'
import { attachGeneratedArtifacts, executeReadToolRequests } from '../services/ArtifactExtractionService'
import { setRealtimeServer } from '../services/RealtimeHub'

interface AuthedSocket extends Socket {
  data: { userId: string }
}

export function setupSocketIO(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', methods: ['GET', 'POST'] }
  })
  const manager = AgentManager.getInstance()
  const orchestrator = Orchestrator.getInstance()
  setRealtimeServer(io)

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) throw new Error('Authentication required')
      socket.data.userId = verifyToken(token).sub
      next()
    } catch (error) {
      next(error instanceof Error ? error : new Error('Authentication failed'))
    }
  })

  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthedSocket
    socket.join(`user:${socket.data.userId}`)
    const cancelledConversations = new Set<string>()

    async function respondSingle(conversation: any, instruction?: string, toolDepth = 0) {
      const agent = conversation.members[0]?.agent
      if (!agent) throw new Error('Conversation has no Agent')
      cancelledConversations.delete(conversation.id)
      const placeholder = await prisma.message.create({
        data: { conversationId: conversation.id, senderType: 'agent', senderId: agent.id, agentId: agent.id, content: '', messageType: 'text', status: 'streaming' }
      })
      io.to(`conversation:${conversation.id}`).emit('message:created', placeholder)
      const runtime = await manager.createRuntimeAgent(agent, socket.data.userId)
      const context = await buildContext(conversation.id, agent)
      if (instruction) context.push({ role: 'user', content: instruction })
      const workspace = await prisma.workspace.findFirst({ where: { userId: socket.data.userId, conversationId: conversation.id }, orderBy: { updatedAt: 'desc' } })
      const content = await runtime.streamChat(context, chunk => {
        if (!cancelledConversations.has(conversation.id)) {
          io.to(`conversation:${conversation.id}`).emit('message:chunk', { conversationId: conversation.id, messageId: placeholder.id, chunk })
        }
      }, { model: agent.model || undefined, conversationId: conversation.id, workspaceId: workspace?.id, agentId: agent.id, messageId: placeholder.id })
      if (cancelledConversations.has(conversation.id)) {
        const cancelled = await prisma.message.update({ where: { id: placeholder.id }, data: { status: 'cancelled', content: 'Generation cancelled.' } })
        io.to(`conversation:${conversation.id}`).emit('message:completed', cancelled)
        return
      }
      let result = await prisma.message.update({ where: { id: placeholder.id }, data: { content, status: 'completed' } })
      const allowedTools = JSON.parse(agent.tools || '[]') as string[]
      const attached = await attachGeneratedArtifacts(socket.data.userId, result.id, content, { conversationId: conversation.id, agentId: agent.id, allowedTools })
      result = attached.message || result
      io.to(`conversation:${conversation.id}`).emit('message:completed', result)
      const toolResult = await executeReadToolRequests(socket.data.userId, content, allowedTools)
      if (toolResult && toolDepth < 1) {
        const toolMessage = await prisma.message.create({
          data: { conversationId: conversation.id, senderType: 'system', senderId: socket.data.userId, content: toolResult, messageType: 'tool-result', status: 'completed' }
        })
        io.to(`conversation:${conversation.id}`).emit('message:created', toolMessage)
        await respondSingle(conversation, 'Use the tool result now available in the conversation to finish the requested work.', toolDepth + 1)
      }
    }

    socket.on('conversation:join', async (conversationId: string) => {
      const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId: socket.data.userId } })
      if (!conversation) return socket.emit('error', { message: 'Conversation not found' })
      socket.join(`conversation:${conversationId}`)
    })

    socket.on('message:send', async (payload: {
      conversationId: string
      content: string
      mentionedAgentIds?: string[]
      quotedMessageId?: string
      artifactContext?: unknown
    }) => {
      try {
        const conversation = await prisma.conversation.findFirst({
          where: { id: payload.conversationId, userId: socket.data.userId },
          include: { members: { include: { agent: true } } }
        })
        if (!conversation) throw new Error('Conversation not found')
        const userMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderType: 'user',
            senderId: socket.data.userId,
            content: payload.content,
            messageType: 'text',
            quotedMessageId: payload.quotedMessageId,
            metadata: JSON.stringify({ mentionedAgentIds: payload.mentionedAgentIds || [], artifactContext: payload.artifactContext })
          }
        })
        await prisma.conversation.update({ where: { id: conversation.id }, data: { lastActiveAt: new Date() } })
        io.to(`conversation:${conversation.id}`).emit('message:created', userMessage)

        if (conversation.type === 'group' || conversation.members.length > 1) {
          await orchestrator.processGroupConversation(socket.data.userId, conversation.id, payload.mentionedAgentIds || [], io)
          return
        }
        await respondSingle(conversation)
      } catch (error) {
        socket.emit('error', { message: error instanceof Error ? error.message : String(error) })
      }
    })

    socket.on('message:regenerate', async (payload: { conversationId: string; messageId: string }) => {
      try {
        const conversation = await prisma.conversation.findFirst({
          where: { id: payload.conversationId, userId: socket.data.userId, type: 'single' },
          include: { members: { include: { agent: true } } }
        })
        const original = await prisma.message.findFirst({ where: { id: payload.messageId, conversationId: payload.conversationId, senderType: 'agent' } })
        if (!conversation || !original) throw new Error('Message is not available for regeneration')
        await respondSingle(conversation, 'Regenerate a fresh answer to the latest user request. Do not refer to the previous draft.')
      } catch (error) {
        socket.emit('error', { message: error instanceof Error ? error.message : String(error) })
      }
    })

    socket.on('orchestration:cancel', async (payload: { conversationId: string }) => {
      cancelledConversations.add(payload.conversationId)
      const run = await orchestrator.cancel(socket.data.userId, payload.conversationId)
      io.to(`conversation:${payload.conversationId}`).emit('orchestration:state', { runId: run?.id, status: 'cancelled' })
    })
  })

  return io
}
