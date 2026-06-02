import prisma from '../utils/prisma'
import { AgentManager } from './agents/AgentManager'

export async function createMergeCandidate(
  userId: string,
  workspaceId: string,
  filePath: string,
  current: string,
  currentHash: string,
  proposed: string,
  origin: Record<string, string | undefined> = {}
) {
  const agent = await prisma.agent.findFirst({
    where: { OR: [{ userId }, { isBuiltin: true }], adapterType: { in: ['mimo', 'openai', 'claude'] } }
  })
  if (!agent) throw new Error('No merge Agent is available')
  const runtime = await AgentManager.getInstance().createRuntimeAgent(agent, userId)
  const merged = await runtime.normalChat([{
    role: 'user',
    content: `Merge these conflicting versions of ${filePath}. Return only the complete merged file.\n\nCURRENT:\n${current}\n\nPROPOSED:\n${proposed}`
  }], { model: agent.model || undefined })
  return prisma.toolApproval.create({
    data: {
      type: 'apply_diff',
      title: `Apply merged conflict result for ${filePath}`,
      userId,
      workspaceId,
      payload: JSON.stringify({ workspaceId, filePath, baseHash: currentHash, content: merged, ...origin })
    }
  })
}
