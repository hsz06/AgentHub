import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import prisma from '../utils/prisma'
import { verifyToken } from '../middleware/auth'
import { buildContext } from '../services/ContextService'
import { AgentManager } from '../services/agents/AgentManager'
import { Orchestrator } from '../services/Orchestrator'
import { attachGeneratedArtifacts, executeReadToolRequests } from '../services/ArtifactExtractionService'
import { setRealtimeServer } from '../services/RealtimeHub'
import { readFileContent } from '../services/WorkspaceFileService'

interface AuthedSocket extends Socket {
  data: { userId: string }
}

interface MessageAttachmentContext {
  artifactId?: string
  name?: string
  type?: string
  mimeType?: string
  size?: number
  url?: string
}

function attachmentPreviewCards(context: unknown) {
  if (!Array.isArray(context)) return []
  return context
    .map((item: MessageAttachmentContext) => {
      if (!item?.artifactId || !item.name) return null
      const image = item.type === 'image' || item.mimeType?.startsWith('image/')
      return {
        type: image ? 'image' : 'file-attachment',
        title: item.name,
        description: item.mimeType || item.type || 'attachment',
        data: image
          ? { artifactId: item.artifactId, imageUrl: item.url || `/api/artifacts/${item.artifactId}/download`, fileName: item.name, fileSize: item.size ? formatBytes(item.size) : undefined }
          : { artifactId: item.artifactId, fileName: item.name, fileType: item.mimeType || 'Attachment', fileSize: item.size ? formatBytes(item.size) : undefined }
      }
    })
    .filter(Boolean)
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function parseAgentCreateCommand(content: string) {
  const trimmed = content.trim()
  if (!/^\/agent(?:\s+|$)/i.test(trimmed)) return null
  const body = trimmed.replace(/^\/agent\s*/i, '').trim()
  const fields: Record<string, string> = {}
  const pattern = /([\w\u4e00-\u9fa5]+)\s*[=:：]\s*("([^"]*)"|'([^']*)'|([^\n]+?))(?=\s+[\w\u4e00-\u9fa5]+\s*[=:：]|$)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    fields[match[1].toLowerCase()] = (match[3] || match[4] || match[5] || '').trim()
  }
  const name = fields.name || fields['名称'] || fields['名字']
  const prompt = fields.prompt || fields.systemprompt || fields.system || fields['提示'] || fields['系统提示']
  if (!name || !prompt) {
    throw new Error('创建 Agent 需要 name/名称 和 prompt/提示，例如：/agent name="前端评审" prompt="你负责审查前端体验"')
  }
  const tags = (fields.tags || fields.capabilities || fields['能力'] || fields['标签'] || 'custom')
    .split(/[,，、]/)
    .map(item => item.trim())
    .filter(Boolean)
  return {
    name,
    description: fields.description || fields['描述'] || '通过聊天指令创建的自定义 Agent',
    capabilities: tags,
    systemPrompt: prompt,
    adapterType: fields.provider || fields.adapter || fields['服务'] || 'mimo',
    model: fields.model || fields['模型'] || null,
    tools: (fields.tools || fields['工具'] || 'read_workspace_file,propose_file_change')
      .split(/[,，、]/)
      .map(item => item.trim())
      .filter(Boolean)
  }
}

function isDirectDeploymentRequest(content: string) {
  const trimmed = content.trim()
  return /^\/deploy(?:\s|$)/i.test(trimmed)
    || /^(请|帮我|现在|直接)?\s*(部署|发布|上线)(当前|这个|项目|workspace|产物|artifact|页面|网页)?/i.test(trimmed)
    || /^(deploy|publish|start locally)(\s|$)/i.test(trimmed)
}

async function hasStartScript(userId: string, workspaceId: string) {
  try {
    const packageFile = await readFileContent(userId, workspaceId, 'package.json')
    const parsed = JSON.parse(packageFile.content) as { scripts?: Record<string, string> }
    return Boolean(parsed.scripts?.start)
  } catch {
    return false
  }
}

async function createDirectDeployment(userId: string, conversationId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId, conversationId },
    orderBy: { updatedAt: 'desc' }
  })
  if (workspace && await hasStartScript(userId, workspace.id)) {
    return prisma.deployment.create({
      data: {
        name: `${workspace.name} 本机预览`,
        type: 'fullstack',
        workspaceId: workspace.id,
        exposedPort: 3000,
        userId,
        approvals: {
          create: {
            type: 'deployment',
            title: `Start locally: ${workspace.name}`,
            payload: JSON.stringify({ type: 'fullstack', workspaceId: workspace.id, exposedPort: 3000, conversationId }),
            userId,
            workspaceId: workspace.id
          }
        }
      },
      include: { approvals: true }
    })
  }

  const artifact = await prisma.artifact.findFirst({
    where: {
      userId,
      type: 'web',
      OR: [
        { versions: { some: { message: { conversationId } } } },
        ...(workspace ? [{ workspaceId: workspace.id }] : [])
      ]
    },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' }
  })
  const version = artifact?.versions[0]
  if (!artifact || !version) return null
  return prisma.deployment.create({
    data: {
      name: `${artifact.name} 静态预览`,
      type: 'static',
      artifactId: artifact.id,
      artifactVersionId: version.id,
      userId,
      approvals: {
        create: {
          type: 'deployment',
          title: `Publish static preview: ${artifact.name}`,
          payload: JSON.stringify({ type: 'static', artifactId: artifact.id, conversationId }),
          userId,
          workspaceId: workspace?.id || null
        }
      }
    },
    include: { approvals: true }
  })
}

async function createDeploymentStatusMessage(userId: string, conversationId: string, deployment: Awaited<ReturnType<typeof createDirectDeployment>>) {
  const content = deployment
    ? `已创建部署审批：${deployment.name}。批准后会${deployment.type === 'static' ? '发布静态预览' : '启动本机 Node 项目预览'}。`
    : '没有找到可部署目标：请先绑定包含 package.json scripts.start 的 workspace，或让 Agent 生成 Web Artifact。'
  return prisma.message.create({
    data: {
      conversationId,
      senderType: 'system',
      senderId: userId,
      content,
      messageType: deployment ? 'deployment' : 'text',
      status: deployment ? 'pending' : 'failed',
      metadata: deployment ? JSON.stringify({
        preview_cards: [{
          type: 'deployment-status',
          title: deployment.name,
          description: deployment.type === 'static' ? '静态 Artifact 发布等待审批' : '本机 Node 项目启动等待审批',
          data: { deploymentId: deployment.id, status: 'pending' }
        }]
      }) : '{}'
    }
  })
}

export function setupSocketIO(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', methods: ['GET', 'POST'] }
  })
  const manager = AgentManager.getInstance()
  const orchestrator = Orchestrator.getInstance()
  setRealtimeServer(io)
  const resumeTimer = setInterval(() => {
    void orchestrator.resumeReadyRuns(io).catch(error => {
      console.error('Failed to resume orchestration after approval', error)
    })
  }, 3000)
  const deploymentStateCache = new Map<string, string>()
  const deploymentTimer = setInterval(() => {
    void broadcastDeploymentStates().catch(error => {
      console.error('Failed to broadcast deployment state', error)
    })
  }, 2000)
  httpServer.on('close', () => {
    clearInterval(resumeTimer)
    clearInterval(deploymentTimer)
  })

  async function broadcastDeploymentStates() {
    const deployments = await prisma.deployment.findMany({
      where: {
        status: { in: ['queued', 'starting', 'success', 'failed', 'stopped'] },
        updatedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    })
    for (const deployment of deployments) {
      const signature = JSON.stringify({
        status: deployment.status,
        previewUrl: deployment.previewUrl,
        runtimeUrl: deployment.runtimeUrl,
        logs: deployment.logs
      })
      if (deploymentStateCache.get(deployment.id) === signature) continue
      deploymentStateCache.set(deployment.id, signature)
      io.to(`user:${deployment.userId}`).emit('deployment:state', {
        deploymentId: deployment.id,
        status: deployment.status,
        previewUrl: deployment.previewUrl,
        type: deployment.type,
        errorMsg: deployment.status === 'failed' ? deployment.logs : undefined
      })
    }
    if (deploymentStateCache.size > 200) {
      const live = new Set(deployments.map(item => item.id))
      for (const id of deploymentStateCache.keys()) {
        if (!live.has(id)) deploymentStateCache.delete(id)
      }
    }
  }

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
      let content = ''
      try {
        const runtime = await manager.createRuntimeAgent(agent, socket.data.userId)
        const context = await buildContext(conversation.id, agent)
        if (instruction) context.push({ role: 'user', content: instruction })
        const workspace = await prisma.workspace.findFirst({ where: { userId: socket.data.userId, conversationId: conversation.id }, orderBy: { updatedAt: 'desc' } })
        content = await runtime.streamChat(context, chunk => {
          if (!cancelledConversations.has(conversation.id)) {
            io.to(`conversation:${conversation.id}`).emit('message:chunk', { conversationId: conversation.id, messageId: placeholder.id, chunk })
          }
        }, { model: agent.model || undefined, conversationId: conversation.id, workspaceId: workspace?.id, agentId: agent.id, messageId: placeholder.id })
      } catch (error) {
        const failed = await prisma.message.update({
          where: { id: placeholder.id },
          data: { status: 'failed', content: error instanceof Error ? error.message : String(error) }
        })
        io.to(`conversation:${conversation.id}`).emit('message:completed', failed)
        throw error
      }
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
        const userPreviewCards = attachmentPreviewCards(payload.artifactContext)
        const userMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderType: 'user',
            senderId: socket.data.userId,
            content: payload.content,
            messageType: 'text',
            quotedMessageId: payload.quotedMessageId,
            metadata: JSON.stringify({ mentionedAgentIds: payload.mentionedAgentIds || [], artifactContext: payload.artifactContext, preview_cards: userPreviewCards })
          }
        })
        await prisma.conversation.update({ where: { id: conversation.id }, data: { lastActiveAt: new Date() } })
        io.to(`conversation:${conversation.id}`).emit('message:created', userMessage)

        const agentDraft = parseAgentCreateCommand(payload.content)
        if (agentDraft) {
          if (!['openai', 'claude', 'mimo'].includes(agentDraft.adapterType)) {
            throw new Error('对话式创建 Agent 当前支持 provider/服务 为 openai、claude 或 mimo')
          }
          const agent = await prisma.agent.create({
            data: {
              name: agentDraft.name,
              description: agentDraft.description,
              capabilities: JSON.stringify(agentDraft.capabilities),
              systemPrompt: agentDraft.systemPrompt,
              adapterType: agentDraft.adapterType,
              model: agentDraft.model,
              tools: JSON.stringify(agentDraft.tools),
              userId: socket.data.userId,
              isBuiltin: false
            }
          })
          const systemMessage = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              senderType: 'system',
              senderId: socket.data.userId,
              content: `已创建自定义 Agent：${agent.name}。现在可以在新会话或当前聊天中 @${agent.name} 使用它。`,
              messageType: 'text',
              metadata: JSON.stringify({ createdAgentId: agent.id }),
              status: 'completed'
            }
          })
          io.to(`user:${socket.data.userId}`).emit('agent:created', agent)
          io.to(`conversation:${conversation.id}`).emit('message:created', systemMessage)
          return
        }

        if (isDirectDeploymentRequest(payload.content)) {
          const deployment = await createDirectDeployment(socket.data.userId, conversation.id)
          const systemMessage = await createDeploymentStatusMessage(socket.data.userId, conversation.id, deployment)
          if (deployment?.approvals[0]) io.to(`user:${socket.data.userId}`).emit('tool:approval-created', deployment.approvals[0])
          io.to(`conversation:${conversation.id}`).emit('message:created', systemMessage)
          io.to(`conversation:${conversation.id}`).emit('message:completed', systemMessage)
          io.to(`conversation:${conversation.id}`).emit('orchestration:state', { status: 'completed' })
          return
        }

        if (conversation.type === 'group' || conversation.members.length > 1 || payload.mentionedAgentIds?.length) {
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
