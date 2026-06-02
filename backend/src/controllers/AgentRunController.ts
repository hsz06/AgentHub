import { Response } from 'express'
import prisma from '../utils/prisma'
import { AuthenticatedRequest, verifyToken } from '../middleware/auth'
import { isCliAdapter, runtimeTypeForAdapter } from '../services/agents/CliAgent'
import { getCliRuntimeConfig } from '../services/CliRuntimeService'
import { permissionProfile, PermissionProfileName } from '../services/agent-platform/types'

export async function createAgentRun(req: AuthenticatedRequest, res: Response) {
  const userId = req.userId!
  const agentId = String(req.body.agentId || '')
  const workspaceId = String(req.body.workspaceId || '')
  const task = String(req.body.task || '').trim()
  const conversationId = req.body.conversationId ? String(req.body.conversationId) : undefined
  if (!agentId || !workspaceId || !task) return res.status(400).json({ error: 'agentId, workspaceId and task are required' })

  const agent = await prisma.agent.findFirst({ where: { id: agentId, OR: [{ isBuiltin: true }, { userId }] } })
  if (!agent || !isCliAdapter(agent.adapterType)) return res.status(400).json({ error: 'Agent must be a Coding Agent Runtime adapter' })
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } })
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' })
  if (conversationId && !(await prisma.conversation.findFirst({ where: { id: conversationId, userId } }))) {
    return res.status(404).json({ error: 'Conversation not found' })
  }
  const runtime = await getCliRuntimeConfig(userId, runtimeTypeForAdapter(agent.adapterType))
  if (!runtime.enabled) return res.status(400).json({ error: `${runtime.displayName} is disabled` })
  if (!runtime.apiKey) return res.status(400).json({ error: `${runtime.displayName} API key is not configured` })

  const run = await prisma.cliRun.create({
    data: {
      userId,
      agentId: agent.id,
      workspaceId: workspace.id,
      conversationId: conversationId || workspace.conversationId || await ensureAgentRunConversation(userId, agent.id),
      prompt: task,
      result: JSON.stringify({
        source: 'agent-runs-api',
        mode: req.body.mode || 'patch',
        permissionProfile: normalizePermission(req.body.permissionProfile || runtime.permissionProfile)
      })
    }
  })
  res.status(201).json(toRunResponse(run))
}

export async function getAgentRun(req: AuthenticatedRequest, res: Response) {
  const run = await prisma.cliRun.findFirst({
    where: { id: req.params.runId, userId: req.userId! },
    include: { agent: true, workspace: true, conversation: true }
  })
  if (!run) return res.status(404).json({ error: 'Agent run not found' })
  res.json(toRunResponse(run))
}

export async function cancelAgentRun(req: AuthenticatedRequest, res: Response) {
  const run = await prisma.cliRun.findFirst({ where: { id: req.params.runId, userId: req.userId! } })
  if (!run) return res.status(404).json({ error: 'Agent run not found' })
  if (['completed', 'failed', 'cancelled'].includes(run.status)) return res.json(toRunResponse(run))
  const updated = await prisma.cliRun.update({ where: { id: run.id }, data: { status: 'cancelling', result: 'Cancellation requested' } })
  res.json(toRunResponse(updated))
}

export async function streamAgentRunEvents(req: AuthenticatedRequest, res: Response) {
  const userId = req.userId || tokenUserId(String(req.query.token || ''))
  if (!userId) return res.status(401).json({ error: 'Authentication required' })
  const runId = req.params.runId
  const exists = await prisma.cliRun.findFirst({ where: { id: runId, userId } })
  if (!exists) return res.status(404).json({ error: 'Agent run not found' })
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  })
  let seenStdout = 0
  let seenStderr = 0
  let lastStatus = ''
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
  send('run_started', { type: 'run_started', runId, provider: providerFromAdapter(exists.agentId), status: exists.status })
  const timer = setInterval(async () => {
    const run = await prisma.cliRun.findFirst({ where: { id: runId, userId } })
    if (!run) {
      send('run_failed', { type: 'run_failed', error: 'Run disappeared' })
      clearInterval(timer)
      res.end()
      return
    }
    if (run.status !== lastStatus) {
      lastStatus = run.status
      send('status', { type: 'status', message: run.status })
    }
    if (run.stdout.length > seenStdout) {
      const text = run.stdout.slice(seenStdout)
      seenStdout = run.stdout.length
      send('assistant_message', { type: 'assistant_message', text })
    }
    if (run.stderr.length > seenStderr) {
      const text = run.stderr.slice(seenStderr)
      seenStderr = run.stderr.length
      send('command_output', { type: 'command_output', stream: 'stderr', text })
    }
    const changes = parseChanges(run.diffSummary)
    for (const change of changes) send('approval_requested', { type: 'approval_requested', reason: `Apply ${change.filePath}`, action: change })
    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      send(run.status === 'completed' ? 'run_completed' : run.status === 'cancelled' ? 'run_cancelled' : 'run_failed', {
        type: run.status === 'completed' ? 'run_completed' : run.status === 'cancelled' ? 'run_cancelled' : 'run_failed',
        summary: run.result || '',
        error: run.status === 'failed' ? run.stderr || run.result : undefined
      })
      clearInterval(timer)
      res.end()
    }
  }, 1000)
  req.on('close', () => clearInterval(timer))
}

function tokenUserId(token: string) {
  if (!token) return undefined
  try { return verifyToken(token).sub } catch { return undefined }
}

async function ensureAgentRunConversation(userId: string, agentId: string) {
  const conversation = await prisma.conversation.create({
    data: {
      title: 'Agent Run',
      type: 'single',
      userId,
      members: { create: [{ agentId }] }
    }
  })
  return conversation.id
}

function normalizePermission(value: unknown): PermissionProfileName {
  return value === 'readonly' || value === 'autonomous' || value === 'safe_write' ? value : 'safe_write'
}

export function permissionForRun(run: { result: string | null }) {
  try {
    const parsed = JSON.parse(run.result || '{}') as { permissionProfile?: PermissionProfileName }
    return permissionProfile(normalizePermission(parsed.permissionProfile))
  } catch {
    return permissionProfile('safe_write')
  }
}

function toRunResponse(run: any) {
  return {
    id: run.id,
    runId: run.id,
    status: run.status,
    agentId: run.agentId,
    workspaceId: run.workspaceId,
    conversationId: run.conversationId,
    stdout: run.stdout,
    stderr: run.stderr,
    result: run.result,
    diffSummary: parseChanges(run.diffSummary),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt
  }
}

function parseChanges(value: string) {
  try { return JSON.parse(value || '[]') as Array<{ filePath: string; approvalId: string }> } catch { return [] }
}

function providerFromAdapter(_agentId: string) {
  return 'coding_agent'
}
