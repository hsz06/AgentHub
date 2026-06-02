import dotenv from 'dotenv'
import prisma from './utils/prisma'
import { executeApprovedDeployment } from './services/DockerSandboxExecutor'
import { executeApprovedCommand } from './services/WorkspaceCommandService'
import { executeNextCliRun } from './services/CliRunWorker'

dotenv.config()

async function poll() {
  if (await executeNextCliRun()) return
  const command = await prisma.toolApproval.findFirst({ where: { type: 'run_command', status: 'queued' }, orderBy: { createdAt: 'asc' } })
  if (command?.workspaceId) {
    await prisma.toolApproval.update({ where: { id: command.id }, data: { status: 'running' } })
    try {
      const payload = JSON.parse(command.payload || '{}') as { command?: string; conversationId?: string; taskId?: string; runId?: string }
      if (!payload.command) throw new Error('Command payload is incomplete')
      const result = await executeApprovedCommand(command.userId, command.workspaceId, payload.command)
      await prisma.toolApproval.update({ where: { id: command.id }, data: { status: 'completed', result } })
      await finishCommandOrigin(command.userId, payload, result, true)
    } catch (error) {
      await prisma.toolApproval.update({
        where: { id: command.id },
        data: { status: 'failed', result: error instanceof Error ? error.message : String(error) }
      })
      const payload = JSON.parse(command.payload || '{}') as { conversationId?: string; taskId?: string; runId?: string }
      await finishCommandOrigin(command.userId, payload, error instanceof Error ? error.message : String(error), false)
    }
    return
  }
  const deployment = await prisma.deployment.findFirst({ where: { type: 'fullstack', status: 'queued' }, orderBy: { createdAt: 'asc' } })
  if (!deployment) return
  await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'starting' } })
  await executeApprovedDeployment(deployment.id)
}

console.log('AgentHub deployment worker is running')
setInterval(() => void poll().catch(error => console.error('Worker failure', error)), 2000)
void poll()

async function finishCommandOrigin(userId: string, payload: { conversationId?: string; taskId?: string; runId?: string }, result: string, success: boolean) {
  if (payload.taskId) {
    await prisma.orchestrationTask.updateMany({
      where: { id: payload.taskId },
      data: { status: success ? 'completed' : 'failed', output: result.slice(0, 8000), completedAt: new Date() }
    })
  }
  if (payload.conversationId) {
    await prisma.message.create({
      data: {
        conversationId: payload.conversationId,
        senderType: 'system',
        senderId: userId,
        messageType: 'tool-result',
        content: `Command ${success ? 'completed' : 'failed'}:\n${result.slice(0, 8000)}`,
        status: success ? 'completed' : 'failed'
      }
    })
  }
  if (payload.runId) {
    const waiting = await prisma.orchestrationTask.count({ where: { runId: payload.runId, status: 'waiting_approval' } })
    if (!waiting) await prisma.orchestrationRun.updateMany({
      where: { id: payload.runId, status: 'waiting_approval' },
      data: { status: success ? 'completed' : 'completed_with_errors', completedAt: new Date() }
    })
  }
}
