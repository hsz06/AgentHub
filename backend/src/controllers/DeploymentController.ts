import { Request, Response } from 'express'
import httpProxy from 'http-proxy'
import prisma from '../utils/prisma'
import { AuthenticatedRequest, verifyPreviewToken } from '../middleware/auth'
import { stopRuntime } from '../services/DockerSandboxExecutor'
import { emitToUser } from '../services/RealtimeHub'
import { readFileContent } from '../services/WorkspaceFileService'

const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true })

export async function listDeployments(req: AuthenticatedRequest, res: Response) {
  res.json(await prisma.deployment.findMany({
    where: { userId: req.userId! },
    include: { approvals: true, artifact: true, workspace: true, logEntries: { orderBy: { createdAt: 'desc' }, take: 20 } },
    orderBy: { createdAt: 'desc' }
  }))
}

export async function createDeployment(req: AuthenticatedRequest, res: Response) {
  const { name, type = 'fullstack', artifactId, workspaceId, exposedPort = 3000 } = req.body
  if (!name || !['static', 'fullstack'].includes(type)) return res.status(400).json({ error: 'Valid deployment name and type are required' })
  if (artifactId && !(await prisma.artifact.findFirst({ where: { id: artifactId, userId: req.userId! } }))) return res.status(400).json({ error: 'Artifact not found' })
  if (workspaceId && !(await prisma.workspace.findFirst({ where: { id: workspaceId, userId: req.userId! } }))) return res.status(400).json({ error: 'Workspace not found' })
  if (type === 'fullstack' && !workspaceId) return res.status(400).json({ error: 'Full-stack deployment requires a workspace' })
  if (type === 'fullstack') {
    try { await readFileContent(req.userId!, workspaceId, 'Dockerfile') } catch { return res.status(400).json({ error: 'Full-stack deployment requires a Dockerfile in the workspace root' }) }
  }
  const artifactVersion = type === 'static' && artifactId
    ? await prisma.artifactVersion.findFirst({ where: { artifactId, artifact: { userId: req.userId! } }, orderBy: { version: 'desc' } })
    : null
  if (type === 'static' && !artifactVersion) return res.status(400).json({ error: 'Static deployment requires an artifact version' })
  const deployment = await prisma.deployment.create({
    data: {
      name,
      type,
      artifactId: artifactId || null,
      artifactVersionId: artifactVersion?.id || null,
      workspaceId: workspaceId || null,
      exposedPort: Number(exposedPort),
      userId: req.userId!,
      approvals: {
        create: {
          type: 'deployment',
          title: `Deploy ${name}`,
          payload: JSON.stringify({ type, artifactId, workspaceId, exposedPort }),
          userId: req.userId!,
          workspaceId: workspaceId || null
        }
      }
    },
    include: { approvals: true }
  })
  emitToUser(req.userId!, 'tool:approval-created', deployment.approvals[0])
  res.status(201).json(deployment)
}

export async function stopDeployment(req: AuthenticatedRequest, res: Response) {
  const deployment = await prisma.deployment.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' })
  try { await stopRuntime(deployment.id) } catch {
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'stopped' } })
  }
  emitToUser(req.userId!, 'deployment:state', { deploymentId: deployment.id, status: 'stopped' })
  res.json(await prisma.deployment.findUnique({ where: { id: deployment.id } }))
}

export async function redeploy(req: AuthenticatedRequest, res: Response) {
  const deployment = await prisma.deployment.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' })
  const updated = await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'queued', logs: '' } })
  emitToUser(req.userId!, 'deployment:state', updated)
  res.json(updated)
}

export async function logs(req: AuthenticatedRequest, res: Response) {
  const deployment = await prisma.deployment.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' })
  res.json(await prisma.deploymentLog.findMany({ where: { deploymentId: deployment.id }, orderBy: { createdAt: 'asc' } }))
}

function authorizePreview(req: Request) {
  const identity = verifyPreviewToken(String(req.query.token || ''))
  if (identity.deploymentId !== req.params.id) throw new Error('Preview token mismatch')
  return identity
}

export async function previewDeployment(req: Request, res: Response) {
  try {
    const identity = authorizePreview(req)
    const deployment = await prisma.deployment.findFirst({
      where: { id: req.params.id, userId: identity.sub, type: 'static', status: 'success' },
      include: { artifact: { include: { versions: true } } }
    })
    const content = deployment?.artifact?.versions.find(version => version.id === deployment.artifactVersionId)?.content
    if (!content) return res.status(404).json({ error: 'Preview unavailable' })
    const origins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').join(' ')
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-ancestors ${origins}`)
    res.type('html').send(content)
  } catch {
    res.status(401).json({ error: 'Preview token is invalid or expired' })
  }
}

export async function runtimeProxy(req: Request, res: Response) {
  try {
    const identity = authorizePreview(req)
    const deployment = await prisma.deployment.findFirst({ where: { id: req.params.id, userId: identity.sub, type: 'fullstack', status: 'success' } })
    if (!deployment?.runtimeUrl) return res.status(404).send('Runtime unavailable')
    const forwardedPath = String((req.params as Record<string, string>)[0] || '').replace(/^\/+/, '')
    req.url = `/${forwardedPath}`
    proxy.web(req, res, { target: deployment.runtimeUrl }, () => res.status(502).send('Runtime proxy unavailable'))
  } catch {
    res.status(401).send('Invalid preview token')
  }
}
