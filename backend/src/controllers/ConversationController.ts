import { Response } from 'express'
import prisma from '../utils/prisma'
import { AuthenticatedRequest } from '../middleware/auth'

const includeMembers = { members: { include: { agent: true } } }

export async function getConversations(req: AuthenticatedRequest, res: Response) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const conversations = await prisma.conversation.findMany({
    where: {
      userId: req.userId!,
      ...(search ? { title: { contains: search } } : {})
    },
    include: includeMembers,
    orderBy: [{ pinned: 'desc' }, { lastActiveAt: 'desc' }]
  })
  res.json(conversations)
}

export async function getConversationById(req: AuthenticatedRequest, res: Response) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: includeMembers
  })
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' })
  res.json(conversation)
}

export async function createConversation(req: AuthenticatedRequest, res: Response) {
  const { title, type, agentIds = [] } = req.body
  if (!['single', 'group'].includes(type) || !Array.isArray(agentIds) || agentIds.length === 0) {
    return res.status(400).json({ error: 'type and at least one agent are required' })
  }
  if (type === 'single' && agentIds.length !== 1) {
    return res.status(400).json({ error: 'A single conversation requires exactly one agent' })
  }
  const availableCount = await prisma.agent.count({
    where: { id: { in: agentIds }, OR: [{ isBuiltin: true }, { userId: req.userId! }] }
  })
  if (availableCount !== new Set(agentIds).size) return res.status(400).json({ error: 'One or more agents are unavailable' })

  const conversation = await prisma.conversation.create({
    data: {
      title: title || '新会话',
      type,
      userId: req.userId!,
      members: { create: [...new Set<string>(agentIds)].map(agentId => ({ agentId })) }
    },
    include: includeMembers
  })
  res.status(201).json(conversation)
}

export async function updateConversation(req: AuthenticatedRequest, res: Response) {
  const existing = await prisma.conversation.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!existing) return res.status(404).json({ error: 'Conversation not found' })
  const { title, pinned, archived } = req.body
  const conversation = await prisma.conversation.update({
    where: { id: existing.id },
    data: {
      ...(typeof title === 'string' && { title }),
      ...(typeof pinned === 'boolean' && { pinned }),
      ...(typeof archived === 'boolean' && { archived })
    }
  })
  res.json(conversation)
}

export async function deleteConversation(req: AuthenticatedRequest, res: Response) {
  const existing = await prisma.conversation.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!existing) return res.status(404).json({ error: 'Conversation not found' })
  await prisma.conversation.delete({ where: { id: existing.id } })
  res.status(204).send()
}

export async function getOrchestrationRuns(req: AuthenticatedRequest, res: Response) {
  const conversation = await prisma.conversation.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' })
  const runs = await prisma.orchestrationRun.findMany({
    where: { conversationId: conversation.id, userId: req.userId! },
    include: { tasks: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  res.json(runs)
}
