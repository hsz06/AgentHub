import dotenv from 'dotenv'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import prisma from './utils/prisma'
import { executeApprovedDeployment } from './services/LocalProcessExecutor'
import { executeApprovedCommand } from './services/WorkspaceCommandService'
import { executeNextCliRun } from './services/CliRunWorker'
import { initializeDatabase } from './utils/prisma'

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

let polling = false

async function pollOnce() {
  if (polling) return
  polling = true
  try {
    await poll()
  } catch (error) {
    console.error('Worker failure', error)
  } finally {
    polling = false
  }
}

async function recoverInterruptedCliRuns() {
  const interrupted = await prisma.cliRun.findMany({ where: { status: 'running' }, select: { id: true } })
  if (!interrupted.length) return
  await prisma.cliRun.updateMany({
    where: { id: { in: interrupted.map(run => run.id) } },
    data: { status: 'failed', result: 'Local execution worker restarted before the CLI run completed', completedAt: new Date() }
  })
  const tempEntries = await fs.readdir(os.tmpdir(), { withFileTypes: true })
  await Promise.all(interrupted.flatMap(run =>
    tempEntries
      .filter(entry => entry.isDirectory() && entry.name.startsWith(`agenthub-cli-${run.id}-`))
      .map(entry => fs.rm(path.join(os.tmpdir(), entry.name), { recursive: true, force: true }))
  ))
  console.warn(`Recovered ${interrupted.length} interrupted CLI run(s)`)
}

async function start() {
  await initializeDatabase()
  await recoverInterruptedCliRuns()
  console.log('AgentHub local execution worker is running')
  setInterval(() => void pollOnce(), 2000)
  void pollOnce()
}

void start().catch(error => {
  console.error('Worker startup failed', error)
  process.exitCode = 1
})

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
      data: { result: result.slice(0, 8000) }
    })
  }
}
