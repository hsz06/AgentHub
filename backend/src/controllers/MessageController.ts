import { Request, Response } from 'express'
import prisma from '../utils/prisma'

export const getMessages = async (req: Request, res: Response) => {
  const { conversationId } = req.params
  const { limit = 200, offset = 0 } = req.query
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [
      { isPinned: 'desc' },
      { createdAt: 'asc' }
    ],
    take: Number(limit),
    skip: Number(offset)
  })
  res.json(messages)
}

export const getMessageById = async (req: Request, res: Response) => {
  const { id } = req.params
  const message = await prisma.message.findUnique({ where: { id } })
  if (!message) {
    return res.status(404).json({ error: 'Message not found' })
  }
  res.json(message)
}

export const togglePinMessage = async (req: Request, res: Response) => {
  const { id } = req.params
  const message = await prisma.message.findUnique({ where: { id } })
  if (!message) {
    return res.status(404).json({ error: 'Message not found' })
  }
  const updatedMessage = await prisma.message.update({
    where: { id },
    data: { isPinned: !message.isPinned }
  })
  res.json(updatedMessage)
}
