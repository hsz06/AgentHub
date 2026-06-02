import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import prisma from '../utils/prisma'
import { getCliRuntimeConfig } from './CliRuntimeService'
import { runtimeTypeForAdapter } from './agents/CliAgent'
import { agentAdapterRegistry } from './agent-platform/AgentAdapterRegistry'
import { AgentProvider, AgentRunRequest, permissionProfile, PermissionProfileName } from './agent-platform/types'
import { eventsToText } from './agent-platform/utils'
import { emitToConversation } from './RealtimeHub'
const IGNORED_PARTS = new Set(['.git', 'node_modules', '.agenthub'])

interface SnapshotEntry {
  hash: string
  content: string
}

type Snapshot = Record<string, SnapshotEntry>

export async function executeNextCliRun() {
  const run = await prisma.cliRun.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    include: { agent: true, workspace: true }
  })
  if (!run) return false
  await prisma.cliRun.update({ where: { id: run.id }, data: { status: 'running' } })
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `agenthub-cli-${run.id}-`))
  try {
    if (!run.agent || !run.workspace || run.workspace.userId !== run.userId) throw new Error('CLI run ownership is invalid')
    const runtimeType = runtimeTypeForAdapter(run.agent.adapterType)
    const config = await getCliRuntimeConfig(run.userId, runtimeType)
    if (!config.enabled) throw new Error(`${config.displayName} is disabled`)
    if (!config.apiKey) throw new Error(`${config.displayName} API key is not configured`)
    if (process.env.SANDBOX_EXECUTION_ENABLED !== 'true') throw new Error('Docker sandbox execution is disabled')

    await fs.cp(run.workspace.rootPath, tempRoot, { recursive: true, force: true })
    const baseSnapshot = await snapshotFiles(tempRoot)
    await fs.mkdir(path.join(tempRoot, '.agenthub'), { recursive: true })
    await fs.writeFile(path.join(tempRoot, '.agenthub', 'prompt.txt'), run.prompt, 'utf8')
    await prisma.cliRun.update({ where: { id: run.id }, data: { baseSnapshot: JSON.stringify(hashOnly(baseSnapshot)) } })

    const provider = providerForRuntime(runtimeType)
    const adapter = agentAdapterRegistry.get(provider)
    const profile = permissionProfile(readPermissionProfile(run.result, config.permissionProfile))
    const request: AgentRunRequest = {
      runId: run.id,
      provider,
      task: run.prompt,
      mode: 'patch',
      workspace: { path: '/workspace' },
      permissions: profile,
      model: run.agent.model || undefined,
      limits: { timeoutSec: Math.ceil(Number(process.env.CLI_AGENT_RUN_TIMEOUT_MS || 300000) / 1000), maxTurns: 10 }
    }
    const runner = adapter.buildCommand(request, { ...config, apiKey: config.apiKey })
    await appendCliOutput(run.id, 'stdout', `Agent runtime: ${provider}\nCommand started in sandbox.\n`, run.conversationId, run.messageId || undefined)
    const { stdout, stderr } = await runDockerStreaming(run.id, [
      'run', '--rm', '--cpus', '1', '--memory', '768m', '--pids-limit', '128',
      '--security-opt', 'no-new-privileges',
      '--network', runner.network,
      ...Object.entries(runner.env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
      '-v', `${tempRoot}:/workspace`,
      '-w', '/workspace',
      runner.image,
      'sh', '-lc', runner.command
    ], adapter, request.runId, run.conversationId, run.messageId || undefined)

    const nextSnapshot = await snapshotFiles(tempRoot)
    const changes = await createApprovalsForChanges(run, baseSnapshot, nextSnapshot)
    const deleted = Object.keys(baseSnapshot).filter(filePath => !nextSnapshot[filePath])
    const result = [
      changes.length ? `${changes.length} file change approval(s) created.` : 'CLI completed with no file changes.',
      deleted.length ? `Deleted files are not auto-applied in v1: ${deleted.join(', ').slice(0, 1000)}` : ''
    ].filter(Boolean).join('\n')
    await prisma.cliRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        stdout: stdout.slice(0, 60000),
        stderr: stderr.slice(0, 20000),
        result,
        diffSummary: JSON.stringify(changes),
        completedAt: new Date()
      }
    })
  } catch (error) {
    await prisma.cliRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        stderr: error instanceof Error ? error.message : String(error),
        result: 'CLI run failed',
        completedAt: new Date()
      }
    })
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
  return true
}

function providerForRuntime(runtimeType: string): AgentProvider {
  if (runtimeType === 'claude-code') return 'claude_code'
  if (runtimeType === 'codex') return 'codex'
  if (runtimeType === 'opencode') return 'opencode'
  throw new Error(`Unsupported runtime type: ${runtimeType}`)
}

async function runDockerStreaming(runId: string, args: string[], adapter: { normalizeStdout(text: string, runId: string): unknown[]; normalizeStderr(text: string, runId: string): unknown[] }, agentRunId: string, conversationId?: string, messageId?: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const proc = spawn('docker', args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('CLI run timed out'))
    }, Number(process.env.CLI_AGENT_RUN_TIMEOUT_MS || 300000))

    proc.stdout.on('data', data => {
      const raw = String(data)
      const text = eventsToText(adapter.normalizeStdout(raw, agentRunId) as any) || raw
      stdout += text
      void appendCliOutput(runId, 'stdout', text, conversationId, messageId)
    })
    proc.stderr.on('data', data => {
      const raw = String(data)
      const text = eventsToText(adapter.normalizeStderr(raw, agentRunId) as any) || raw
      stderr += text
      void appendCliOutput(runId, 'stderr', text, conversationId, messageId)
    })
    const cancelTimer = setInterval(async () => {
      const current = await prisma.cliRun.findUnique({ where: { id: runId }, select: { status: true } })
      if (current?.status === 'cancelling') {
        proc.kill('SIGKILL')
        await prisma.cliRun.update({ where: { id: runId }, data: { status: 'cancelled', result: 'Cancelled by user', completedAt: new Date() } }).catch(() => undefined)
      }
    }, 1000)
    proc.on('error', error => {
      clearTimeout(timer)
      clearInterval(cancelTimer)
      reject(error)
    })
    proc.on('close', code => {
      clearTimeout(timer)
      clearInterval(cancelTimer)
      prisma.cliRun.findUnique({ where: { id: runId }, select: { status: true } }).then(current => {
        if (current?.status === 'cancelled') resolve({ stdout, stderr })
        else if (code === 0) resolve({ stdout, stderr })
        else reject(new Error(`Agent runtime exited with code ${code}\n${stderr || stdout}`))
      }).catch(reject)
    })
  })
}

async function appendCliOutput(runId: string, stream: 'stdout' | 'stderr', chunk: string, conversationId?: string, messageId?: string) {
  if (!chunk) return
  const run = await prisma.cliRun.findUnique({ where: { id: runId } })
  if (!run) return
  const field = stream === 'stdout' ? 'stdout' : 'stderr'
  const current = stream === 'stdout' ? run.stdout : run.stderr
  await prisma.cliRun.update({ where: { id: runId }, data: { [field]: `${current}${chunk}`.slice(-60000) } })
  if (conversationId && messageId) emitToConversation(conversationId, 'message:chunk', { conversationId, messageId, chunk })
}

function readPermissionProfile(result: string | null, fallback?: string): PermissionProfileName {
  try {
    const parsed = JSON.parse(result || '{}') as { permissionProfile?: PermissionProfileName }
    if (parsed.permissionProfile === 'readonly' || parsed.permissionProfile === 'safe_write' || parsed.permissionProfile === 'autonomous') return parsed.permissionProfile
  } catch {
    // Ignore metadata parse failure.
  }
  return fallback === 'readonly' || fallback === 'autonomous' || fallback === 'safe_write' ? fallback : 'safe_write'
}

async function snapshotFiles(root: string) {
  const snapshot: Snapshot = {}
  async function scan(directory: string) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      if (IGNORED_PARTS.has(item.name)) continue
      const absolute = path.join(directory, item.name)
      const relative = path.relative(root, absolute).replace(/\\/g, '/')
      if (relative.split('/').some(part => IGNORED_PARTS.has(part))) continue
      if (item.isDirectory()) {
        await scan(absolute)
      } else if (item.isFile()) {
        const buffer = await fs.readFile(absolute)
        if (buffer.includes(0)) continue
        const content = buffer.toString('utf8')
        snapshot[relative] = { hash: sha256(content), content }
      }
    }
  }
  await scan(root)
  return snapshot
}

async function createApprovalsForChanges(run: { id: string; userId: string; workspaceId: string; conversationId: string; agentId: string }, before: Snapshot, after: Snapshot) {
  const changes: Array<{ filePath: string; approvalId: string }> = []
  for (const [filePath, next] of Object.entries(after)) {
    const previous = before[filePath]
    if (previous?.hash === next.hash) continue
    const approval = await prisma.toolApproval.create({
      data: {
        userId: run.userId,
        workspaceId: run.workspaceId,
        type: 'apply_diff',
        title: `Apply CLI change to ${filePath}`,
        payload: JSON.stringify({
          filePath,
          baseHash: previous?.hash,
          content: next.content,
          conversationId: run.conversationId,
          agentId: run.agentId,
          cliRunId: run.id
        })
      }
    })
    changes.push({ filePath, approvalId: approval.id })
  }
  return changes
}

function hashOnly(snapshot: Snapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([filePath, entry]) => [filePath, entry.hash]))
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}
