import { Request, Response } from 'express'
import prisma from '../utils/prisma'

export const getAgents = async (req: Request, res: Response) => {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: 'asc' }
  })
  res.json(agents)
}

export const getAgentById = async (req: Request, res: Response) => {
  const { id } = req.params
  const agent = await prisma.agent.findUnique({ where: { id } })
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }
  res.json(agent)
}
