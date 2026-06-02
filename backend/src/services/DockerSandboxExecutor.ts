import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import prisma from '../utils/prisma'
import { issuePreviewToken } from '../middleware/auth'

const execFileAsync = promisify(execFile)

async function log(deploymentId: string, message: string, level = 'info') {
  await prisma.deploymentLog.create({ data: { deploymentId, message: message.slice(0, 8000), level } })
  await prisma.deployment.update({ where: { id: deploymentId }, data: { logs: message.slice(0, 8000) } })
}

export async function executeApprovedDeployment(deploymentId: string) {
  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId }, include: { workspace: true } })
  if (!deployment || deployment.type !== 'fullstack' || !deployment.workspace) return
  const configuredRoot = path.resolve(process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), 'data', 'workspaces'))
  const sourceRoot = path.resolve(deployment.workspace.rootPath)
  if (!sourceRoot.startsWith(`${configuredRoot}${path.sep}`)) return fail(deployment.id, 'Workspace path is outside managed root')
  try {
    await fs.access(path.join(sourceRoot, 'Dockerfile'))
  } catch {
    return fail(deployment.id, 'Full-stack deployment requires a Dockerfile in the workspace root')
  }
  const image = `agenthub-preview-${deployment.id.toLowerCase()}`
  const container = `agenthub-run-${deployment.id.toLowerCase()}`
  const containerPort = deployment.exposedPort || 3000
  try {
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'building', exposedPort: containerPort } })
    await log(deployment.id, 'Building sandbox image...')
    const built = await execFileAsync('docker', ['build', '--tag', image, sourceRoot], { timeout: 300000 })
    await log(deployment.id, built.stdout || 'Image build completed')
    await execFileAsync('docker', ['rm', '-f', container], { timeout: 15000 }).catch(() => undefined)
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'deploying' } })
    const run = await execFileAsync('docker', [
      'run', '--detach', '--name', container,
      '--cpus', '1', '--memory', '512m', '--pids-limit', '128',
      '--security-opt', 'no-new-privileges', '--read-only',
      '-p', `127.0.0.1::${containerPort}`, image
    ], { timeout: 30000 })
    const port = await execFileAsync('docker', ['port', container, `${containerPort}/tcp`], { timeout: 15000 })
    const hostPort = port.stdout.trim().split(':').pop()
    if (!hostPort) throw new Error('Container port was not published')
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'success',
        containerId: run.stdout.trim(),
        runtimeUrl: `http://host.docker.internal:${hostPort}`,
        previewUrl: `/api/deployments/${deployment.id}/runtime?token=${encodeURIComponent(issuePreviewToken(deployment.userId, deployment.id))}`
      }
    })
    await log(deployment.id, `Container started on proxy target port ${hostPort}`)
  } catch (error) {
    await fail(deployment.id, error instanceof Error ? error.message : String(error))
  }
}

export async function stopRuntime(deploymentId: string) {
  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } })
  if (!deployment) throw new Error('Deployment not found')
  if (deployment.containerId) {
    await execFileAsync('docker', ['rm', '-f', `agenthub-run-${deployment.id.toLowerCase()}`], { timeout: 30000 }).catch(() => undefined)
  }
  await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'stopped', containerId: null, runtimeUrl: null } })
  await log(deployment.id, 'Deployment stopped')
}

async function fail(deploymentId: string, reason: string) {
  await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'failed' } })
  await log(deploymentId, reason, 'error')
}
