import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import prisma from '../utils/prisma'
import { ensureLocalExecutionEnabled, getCliRuntimeConfig, localProcessEnv } from './CliRuntimeService'
import { runtimeTypeForAdapter } from './agents/CliAgent'
import { agentAdapterRegistry } from './agent-platform/AgentAdapterRegistry'
import { AgentProvider, AgentRunRequest, permissionProfile, PermissionProfileName } from './agent-platform/types'
import { eventsToText } from './agent-platform/utils'
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
    ensureLocalExecutionEnabled()

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
      workspace: { path: tempRoot },
      permissions: profile,
      model: run.agent.model || undefined,
      limits: { timeoutSec: Math.ceil(Number(process.env.CLI_AGENT_RUN_TIMEOUT_MS || 300000) / 1000), maxTurns: 10 }
    }
    const runner = adapter.buildCommand(request, { ...config, apiKey: config.apiKey })
    const { stdout, stderr } = await runLocalStreaming(run.id, runner.executablePath, runner.args, runner.env, tempRoot, adapter, request.runId)
    const current = await prisma.cliRun.findUnique({ where: { id: run.id }, select: { status: true } })
    if (current?.status === 'cancelled') return true

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

async function runLocalStreaming(runId: string, executablePath: string, args: string[], env: Record<string, string>, cwd: string, adapter: { normalizeStdout(text: string, runId: string): unknown[]; normalizeStderr(text: string, runId: string): unknown[] }, agentRunId: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const proc = spawn(executablePath, args, { cwd, env: localProcessEnv(executablePath, env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let persistTimer: NodeJS.Timeout | undefined
    let persistChain = Promise.resolve()
    let settled = false
    const rejectOnce = (error: unknown) => {
      if (settled) return
      settled = true
      proc.kill('SIGKILL')
      reject(error)
    }
    const persist = () => {
      persistTimer = undefined
      const nextStdout = stdout
      const nextStderr = stderr
      persistChain = persistChain
        .then(() => persistCliOutput(runId, nextStdout, nextStderr))
        .catch(rejectOnce)
    }
    const schedulePersist = () => {
      if (!persistTimer) persistTimer = setTimeout(persist, 1000)
    }
    const flushPersist = async () => {
      if (persistTimer) {
        clearTimeout(persistTimer)
        persist()
      }
      await persistChain
    }
    const timer = setTimeout(() => {
      rejectOnce(new Error('CLI run timed out'))
    }, Number(process.env.CLI_AGENT_RUN_TIMEOUT_MS || 300000))

    proc.stdout.on('data', data => {
      stdoutBuffer += String(data)
      const lines = takeCompleteLines(stdoutBuffer)
      stdoutBuffer = lines.remainder
      const text = eventsToText(adapter.normalizeStdout(lines.complete, agentRunId) as any)
      stdout += text
      schedulePersist()
    })
    proc.stderr.on('data', data => {
      stderrBuffer += String(data)
      const lines = takeCompleteLines(stderrBuffer)
      stderrBuffer = lines.remainder
      const text = eventsToText(adapter.normalizeStderr(lines.complete, agentRunId) as any)
      stderr += text
      schedulePersist()
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
      rejectOnce(error)
    })
    proc.on('close', async code => {
      clearTimeout(timer)
      clearInterval(cancelTimer)
      const trailingStdout = eventsToText(adapter.normalizeStdout(stdoutBuffer, agentRunId) as any)
      const trailingStderr = eventsToText(adapter.normalizeStderr(stderrBuffer, agentRunId) as any)
      stdout += trailingStdout
      stderr += trailingStderr
      try {
        await flushPersist()
        const current = await prisma.cliRun.findUnique({ where: { id: runId }, select: { status: true } })
        if (settled) return
        settled = true
        if (current?.status === 'cancelled') resolve({ stdout, stderr })
        else if (code === 0) resolve({ stdout, stderr })
        else reject(new Error(`Agent runtime exited with code ${code}\n${stderr || stdout}`))
      } catch (error) {
        rejectOnce(error)
      }
    })
  })
}

async function persistCliOutput(runId: string, stdout: string, stderr: string) {
  await prisma.cliRun.update({
    where: { id: runId },
    data: { stdout: stdout.slice(-60000), stderr: stderr.slice(-20000) }
  })
}

function takeCompleteLines(value: string) {
  const lastBreak = value.lastIndexOf('\n')
  if (lastBreak < 0) return { complete: '', remainder: value }
  return { complete: value.slice(0, lastBreak + 1), remainder: value.slice(lastBreak + 1) }
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
  const changes: Array<{ filePath: string; approvalId: string; oldCode: string; newCode: string }> = []
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
          oldContent: previous?.content || '',
          conversationId: run.conversationId,
          agentId: run.agentId,
          cliRunId: run.id
        })
      }
    })
    changes.push({ filePath, approvalId: approval.id, oldCode: previous?.content || '', newCode: next.content })
  }
  return changes
}

function hashOnly(snapshot: Snapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([filePath, entry]) => [filePath, entry.hash]))
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}
