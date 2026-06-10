import { Response } from 'express'
import prisma from '../utils/prisma'
import { AuthenticatedRequest } from '../middleware/auth'

const supportedAdapterTypes = ['openai', 'claude', 'mimo', 'claude-code-cli', 'codex-cli', 'opencode-cli']

export async function getAgents(req: AuthenticatedRequest, res: Response) {
  const agents = await prisma.agent.findMany({
    where: { OR: [{ isBuiltin: true }, { userId: req.userId! }] },
    orderBy: [{ isBuiltin: 'desc' }, { createdAt: 'asc' }]
  })
  res.json(agents)
}

export async function getAgentById(req: AuthenticatedRequest, res: Response) {
  const agent = await prisma.agent.findFirst({
    where: { id: req.params.id, OR: [{ isBuiltin: true }, { userId: req.userId! }] }
  })
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
}

export async function createAgent(req: AuthenticatedRequest, res: Response) {
  const { name, avatar, description, capabilities, systemPrompt, adapterType, model, tools } = req.body
  if (!name || !supportedAdapterTypes.includes(adapterType)) {
    return res.status(400).json({ error: 'name and supported adapterType are required' })
  }
  const newAgent = await prisma.agent.create({
    data: {
      name,
      avatar: avatar || null,
      description: description || null,
      capabilities: JSON.stringify(capabilities || []),
      systemPrompt: systemPrompt || null,
      adapterType,
      model: model || null,
      tools: JSON.stringify(tools || []),
      userId: req.userId!,
      isBuiltin: false
    }
  })
  res.status(201).json(newAgent)
}

export async function updateAgent(req: AuthenticatedRequest, res: Response) {
  const existing = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId!, isBuiltin: false } })
  if (!existing) return res.status(404).json({ error: 'Editable Agent not found' })
  const { name, avatar, description, capabilities, systemPrompt, adapterType, model, tools } = req.body
  if (adapterType !== undefined && !supportedAdapterTypes.includes(adapterType)) {
    return res.status(400).json({ error: 'supported adapterType is required' })
  }
  const updatedAgent = await prisma.agent.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined && { name }),
      ...(avatar !== undefined && { avatar }),
      ...(description !== undefined && { description }),
      ...(capabilities !== undefined && { capabilities: JSON.stringify(capabilities) }),
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(adapterType !== undefined && { adapterType }),
      ...(model !== undefined && { model }),
      ...(tools !== undefined && { tools: JSON.stringify(tools) })
    }
  })
  res.json(updatedAgent)
}

export async function deleteAgent(req: AuthenticatedRequest, res: Response) {
  const existing = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId!, isBuiltin: false } })
  if (!existing) return res.status(404).json({ error: 'Editable Agent not found' })
  await prisma.agent.delete({ where: { id: existing.id } })
  res.status(204).send()
}
