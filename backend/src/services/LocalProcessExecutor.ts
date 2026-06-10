import { spawn } from 'child_process'
import fs from 'fs/promises'
import net from 'net'
import path from 'path'
import prisma from '../utils/prisma'
import { issuePreviewToken } from '../middleware/auth'
import { ensureLocalExecutionEnabled, localProcessEnv } from './CliRuntimeService'
import { emitToUser } from './RealtimeHub'

async function log(deploymentId: string, message: string, level = 'info') {
  if (!message.trim()) return
  const entry = message.slice(0, 8000)
  await prisma.deploymentLog.create({ data: { deploymentId, message: entry, level } })
  await prisma.deployment.update({ where: { id: deploymentId }, data: { logs: entry } })
}

export async function executeApprovedDeployment(deploymentId: string) {
  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId }, include: { workspace: true } })
  if (!deployment || deployment.type !== 'fullstack' || !deployment.workspace) return
  let runtimePid: number | undefined
  try {
    ensureLocalExecutionEnabled()
    const configuredRoot = path.resolve(process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), 'data', 'workspaces'))
    const sourceRoot = path.resolve(deployment.workspace.rootPath)
    if (!sourceRoot.startsWith(`${configuredRoot}${path.sep}`)) throw new Error('Workspace path is outside managed root')
    await assertStartScript(sourceRoot)
    const previewToken = issuePreviewToken(deployment.userId, deployment.id)
    const port = await findFreePort()
    const npmBin = process.env.NPM_BIN || 'npm'
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'starting', exposedPort: port } })
    emitToUser(deployment.userId, 'deployment:state', { deploymentId: deployment.id, status: 'starting', type: deployment.type })
    await log(deployment.id, `Starting local runtime on 127.0.0.1:${port}...`)
    const child = spawn(npmBin, ['run', 'start'], {
      cwd: sourceRoot,
      detached: true,
      env: localProcessEnv(npmBin, { HOST: '127.0.0.1', PORT: String(port) }),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    if (!child.pid) throw new Error('Local runtime did not return a process id')
    runtimePid = child.pid
    child.unref()
    child.stdout?.on('data', data => void log(deployment.id, String(data)).catch(() => undefined))
    child.stderr?.on('data', data => void log(deployment.id, String(data), 'error').catch(() => undefined))
    child.on('exit', (code, signal) => {
      void markExited(deployment.id, code, signal).catch(() => undefined)
    })
    await prisma.deployment.update({ where: { id: deployment.id }, data: { runtimePid: child.pid } })
    await waitForPort(port, child.pid)
    const updated = await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'success',
        runtimeUrl: `http://127.0.0.1:${port}`,
        previewUrl: `/api/deployments/${deployment.id}/runtime?token=${encodeURIComponent(previewToken)}`
      }
    })
    emitToUser(deployment.userId, 'deployment:state', {
      deploymentId: deployment.id,
      status: updated.status,
      previewUrl: updated.previewUrl,
      type: updated.type
    })
    await log(deployment.id, `Local runtime started with PID ${child.pid}`)
  } catch (error) {
    if (runtimePid) terminateProcess(runtimePid)
    await fail(deployment.id, error instanceof Error ? error.message : String(error))
  }
}

export async function stopRuntime(deploymentId: string) {
  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } })
  if (!deployment) throw new Error('Deployment not found')
  if (deployment.runtimePid) {
    terminateProcess(deployment.runtimePid)
  }
  const updated = await prisma.deployment.update({
    where: { id: deployment.id },
    data: { status: 'stopped', runtimePid: null, runtimeUrl: null }
  })
  emitToUser(deployment.userId, 'deployment:state', { deploymentId: deployment.id, status: updated.status, type: updated.type })
  await log(deployment.id, 'Local runtime stopped')
}

async function assertStartScript(root: string) {
  const parsed = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
  if (!parsed.scripts?.start) throw new Error('Local deployment requires package.json with scripts.start')
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForPort(port: number, pid: number) {
  const deadline = Date.now() + Number(process.env.LOCAL_DEPLOY_START_TIMEOUT_MS || 30000)
  while (Date.now() < deadline) {
    if (!isRunning(pid)) throw new Error('Local runtime exited before opening its port')
    if (await canConnect(port)) return
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  try { process.kill(-pid, 'SIGTERM') } catch { /* Process already exited. */ }
  throw new Error('Local runtime did not open its port before timeout')
}

function canConnect(port: number) {
  return new Promise<boolean>(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(500)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
  })
}

function isRunning(pid: number) {
  try { process.kill(pid, 0); return true } catch { return false }
}

function terminateProcess(pid: number) {
  try { process.kill(-pid, 'SIGTERM') } catch {
    try { process.kill(pid, 'SIGTERM') } catch {
      // The process may already have exited.
    }
  }
}

async function markExited(deploymentId: string, code: number | null, signal: NodeJS.Signals | null) {
  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } })
  if (!deployment || deployment.status === 'stopped') return
  const updated = await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'failed', runtimePid: null, runtimeUrl: null } })
  emitToUser(updated.userId, 'deployment:state', { deploymentId, status: updated.status, type: updated.type, errorMsg: `Local runtime exited (${signal || code || 'unknown'}).` })
  await log(deploymentId, `Local runtime exited (${signal || code || 'unknown'}).`, 'error')
}

async function fail(deploymentId: string, reason: string) {
  const updated = await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'failed', runtimePid: null, runtimeUrl: null } })
  emitToUser(updated.userId, 'deployment:state', { deploymentId, status: updated.status, type: updated.type, errorMsg: reason })
  await log(deploymentId, reason, 'error')
}
