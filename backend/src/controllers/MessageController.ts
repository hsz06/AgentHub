import { Response } from 'express'
import prisma from '../utils/prisma'
import { AuthenticatedRequest } from '../middleware/auth'

async function userOwnsConversation(userId: string, conversationId: string) {
  return prisma.conversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } })
}

export async function getMessages(req: AuthenticatedRequest, res: Response) {
  if (!(await userOwnsConversation(req.userId!, req.params.conversationId))) {
    return res.status(404).json({ error: 'Conversation not found' })
  }
  const limit = Math.min(Number(req.query.limit || 200), 500)
  const offset = Number(req.query.offset || 0)
  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.conversationId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    skip: offset,
    include: { artifactVersions: { include: { artifact: true } } }
  })
  res.json(messages)
}

export async function getMessageById(req: AuthenticatedRequest, res: Response) {
  const message = await prisma.message.findFirst({
    where: { id: req.params.id, conversation: { userId: req.userId! } },
    include: { artifactVersions: { include: { artifact: true } } }
  })
  if (!message) return res.status(404).json({ error: 'Message not found' })
  res.json(message)
}

export async function togglePinMessage(req: AuthenticatedRequest, res: Response) {
  const message = await prisma.message.findFirst({
    where: { id: req.params.id, conversation: { userId: req.userId! } }
  })
  if (!message) return res.status(404).json({ error: 'Message not found' })
  const updatedMessage = await prisma.message.update({
    where: { id: message.id },
    data: { isPinned: !message.isPinned }
  })
  res.json(updatedMessage)
}

