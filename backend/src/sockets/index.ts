import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import prisma from '../utils/prisma'
import { Orchestrator } from '../services/Orchestrator'
import { AgentManager } from '../services/agents/AgentManager'
import { Message as AgentMessage } from '../services/agents/BaseAgent'

export function setupSocketIO(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  })

  const orchestrator = Orchestrator.getInstance()
  const agentManager = AgentManager.getInstance()

  async function buildSingleAgentFullContext(conversationId: string, newMessageContent: string): Promise<AgentMessage[]> {
    const allMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    })

    const pinnedMessages = allMessages.filter(m => m.isPinned)
    const recentMessages = allMessages.slice(-50)

    const contextMessages: AgentMessage[] = []

    if (pinnedMessages.length > 0) {
      const pinnedContextHeader: AgentMessage = {
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

    return contextMessages
  }

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id)

    socket.on('join-conversation', async (conversationId: string) => {
      socket.join(`conversation:${conversationId}`)
      console.log(`Socket ${socket.id} joined conversation: ${conversationId}`)
      socket.emit('joined-conversation', { conversationId })
    })

    socket.on('send-message', async (data: {
      conversationId: string
      senderType: string
      senderId: string
      content: string
      messageType: string
      metadata?: string
    }) => {
      const userMessage = await prisma.message.create({
        data: {
          conversationId: data.conversationId,
          senderType: data.senderType,
          senderId: data.senderId,
          content: data.content,
          messageType: data.messageType,
          metadata: data.metadata || '{}'
        }
      })
      
      await prisma.conversation.update({
        where: { id: data.conversationId },
        data: { lastActiveAt: new Date() }
      })

      io.to(`conversation:${data.conversationId}`).emit('new-message', userMessage)

      const conversation = await prisma.conversation.findUnique({
        where: { id: data.conversationId },
        include: { members: { include: { agent: true } } }
      })

      if (!conversation) return

      if (conversation.members.length <= 1) {
        const singleMember = conversation.members[0]
        if (!singleMember) return
        const runtimeAgent = agentManager.getAgent(singleMember.agent.name)
        if (!runtimeAgent) return

        const fullContextMessages: AgentMessage[] = await buildSingleAgentFullContext(data.conversationId, data.content)
        
        try {
          const replyContent = await runtimeAgent.normalChat(fullContextMessages)
          const agentMessage = await prisma.message.create({
            data: {
              conversationId: data.conversationId,
              senderType: 'agent',
              senderId: singleMember.agentId,
              content: replyContent,
              messageType: 'text'
            }
          })
          io.to(`conversation:${data.conversationId}`).emit('new-message', agentMessage)
        } catch (err) {
          const errorMsg = await prisma.message.create({
            data: {
              conversationId: data.conversationId,
              senderType: 'system',
              senderId: 'system',
              content: `Agent 回复失败: ${String(err)}`,
              messageType: 'text'
            }
          })
          io.to(`conversation:${data.conversationId}`).emit('new-message', errorMsg)
        }
      } else {
        orchestrator.processGroupConversation(data.conversationId, data.content, io)
          .then(async (aggregatedResult) => {
            const resultMessage = await prisma.message.create({
              data: {
                conversationId: data.conversationId,
                senderType: 'system',
                senderId: 'orchestrator',
                content: aggregatedResult,
                messageType: 'text'
              }
            })
            io.to(`conversation:${data.conversationId}`).emit('new-message', resultMessage)
          })
          .catch(async (err) => {
            const errorMsg = await prisma.message.create({
              data: {
                conversationId: data.conversationId,
                senderType: 'system',
                senderId: 'system',
                content: `Orchestrator 调度失败: ${String(err)}`,
                messageType: 'text'
              }
            })
            io.to(`conversation:${data.conversationId}`).emit('new-message', errorMsg)
          })
      }
    })

    socket.on('stream-chunk', (data: {
      conversationId: string
      messageId?: string
      chunk: string
      isDone?: boolean
    }) => {
      io.to(`conversation:${data.conversationId}`).emit('stream-chunk', data)
    })

    socket.on('leave-conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`)
      console.log(`Socket ${socket.id} left conversation: ${conversationId}`)
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  return io
}
