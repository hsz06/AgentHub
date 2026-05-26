import { Request, Response } from 'express'
import prisma from '../utils/prisma'

export const getConversations = async (req: Request, res: Response) => {
  const { userId } = req.query
  const conversations = await prisma.conversation.findMany({
    where: { userId: userId as string },
    include: {
      members: {
        include: { agent: true }
      }
    },
    orderBy: { lastActiveAt: 'desc' }
  })
  res.json(conversations)
}

export const getConversationById = async (req: Request, res: Response) => {
  const { id } = req.params
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      members: {
        include: { agent: true }
      }
    }
  })
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' })
  }
  res.json(conversation)
}

export const createConversation = async (req: Request, res: Response) => {
  const { title, type, userId, agentIds } = req.body
  const conversation = await prisma.conversation.create({
    data: {
      title,
      type,
      userId,
      members: {
        create: agentIds?.map((agentId: string) => ({ agentId })) || []
      }
    },
    include: {
      members: {
        include: { agent: true }
      }
    }
  })
  res.status(201).json(conversation)
}

export const updateConversation = async (req: Request, res: Response) => {
  const { id } = req.params
  const { title, pinned, archived } = req.body
  const conversation = await prisma.conversation.update({
    where: { id },
    data: { title, pinned, archived }
  })
  res.json(conversation)
}

export const deleteConversation = async (req: Request, res: Response) => {
  const { id } = req.params
  await prisma.conversation.delete({ where: { id } })
  res.status(204).send()
}
