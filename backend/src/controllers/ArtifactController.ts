import { Response } from 'express'
import prisma from '../utils/prisma'
import { AuthenticatedRequest } from '../middleware/auth'
import PptxGenJS from 'pptxgenjs'

async function ownedArtifact(userId: string, id: string) {
  return prisma.artifact.findFirst({ where: { id, userId } })
}

export async function listArtifacts(req: AuthenticatedRequest, res: Response) {
  const artifacts = await prisma.artifact.findMany({
    where: { userId: req.userId!, ...(req.query.workspaceId ? { workspaceId: String(req.query.workspaceId) } : {}) },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' }
  })
  res.json(artifacts)
}

export async function createArtifact(req: AuthenticatedRequest, res: Response) {
  const { name, type, mimeType, workspaceId, content = '', metadata = {}, encoding } = req.body
  if (!name || !['web', 'code', 'document', 'slides', 'image', 'attachment'].includes(type)) {
    return res.status(400).json({ error: 'Valid artifact name and type are required' })
  }
  if (workspaceId) {
    const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, userId: req.userId! } })
    if (!workspace) return res.status(400).json({ error: 'Workspace not found' })
  }
  const artifact = await prisma.artifact.create({
    data: {
      name,
      type,
      mimeType,
      workspaceId: workspaceId || null,
      userId: req.userId!,
      versions: {
        create: { version: 1, content: String(content), metadata: JSON.stringify({ ...metadata, encoding }), createdBy: req.userId! }
      }
    },
    include: { versions: true }
  })
  res.status(201).json(artifact)
}

export async function getArtifact(req: AuthenticatedRequest, res: Response) {
  const artifact = await prisma.artifact.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { versions: { orderBy: { version: 'desc' } } }
  })
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' })
  res.json(artifact)
}

export async function createVersion(req: AuthenticatedRequest, res: Response) {
  const artifact = await ownedArtifact(req.userId!, req.params.id)
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' })
  const latest = await prisma.artifactVersion.findFirst({
    where: { artifactId: artifact.id },
    orderBy: { version: 'desc' }
  })
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      version: (latest?.version || 0) + 1,
      content: String(req.body.content || ''),
      metadata: JSON.stringify(req.body.metadata || {}),
      createdBy: req.userId!
    }
  })
  res.status(201).json(version)
}

export async function getVersionContent(req: AuthenticatedRequest, res: Response) {
  const version = await prisma.artifactVersion.findFirst({
    where: { id: req.params.versionId, artifact: { id: req.params.id, userId: req.userId! } },
    include: { artifact: true }
  })
  if (!version) return res.status(404).json({ error: 'Artifact version not found' })
  res.json(version)
}

export async function downloadArtifact(req: AuthenticatedRequest, res: Response) {
  const artifact = await prisma.artifact.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
  })
  const content = artifact?.versions[0]?.content
  if (!artifact || content === undefined) return res.status(404).json({ error: 'Artifact not found' })
  const extension = artifact.type === 'document' ? '.md' : artifact.type === 'web' ? '.html' : artifact.type === 'slides' ? '.json' : ''
  const filename = artifact.name.includes('.') ? artifact.name : `${artifact.name}${extension}`
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`)
  let metadata: { encoding?: string } = {}
  try { metadata = JSON.parse(artifact.versions[0].metadata || '{}') } catch { metadata = {} }
  res.type(artifact.mimeType || 'text/plain').send(metadata.encoding === 'base64' ? Buffer.from(content, 'base64') : content)
}

export async function exportSlides(req: AuthenticatedRequest, res: Response) {
  const artifact = await prisma.artifact.findFirst({
    where: { id: req.params.id, userId: req.userId!, type: 'slides' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
  })
  if (!artifact?.versions[0]) return res.status(404).json({ error: 'Slides artifact not found' })
  try {
    const parsed = JSON.parse(artifact.versions[0].content) as { slides?: Array<{ title?: string; body?: string; background?: string }> }
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'
    for (const entry of parsed.slides || []) {
      const slide = pptx.addSlide()
      if (entry.background) slide.background = { color: entry.background.replace('#', '') }
      slide.addText(entry.title || '', { x: 0.65, y: 0.7, w: 12, h: 0.7, fontSize: 28, bold: true, color: '17233B' })
      slide.addText(entry.body || '', { x: 0.65, y: 1.75, w: 12, h: 4.5, fontSize: 18, color: '344054', valign: 'top' })
    }
    if (!parsed.slides?.length) pptx.addSlide().addText('Untitled presentation', { x: 1, y: 1, w: 10, h: 1, fontSize: 28 })
    const output = await pptx.write({ outputType: 'nodebuffer' }) as Buffer
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}.pptx"`)
    res.type('application/vnd.openxmlformats-officedocument.presentationml.presentation').send(output)
  } catch {
    res.status(400).json({ error: 'Slides content must be valid slide JSON' })
  }
}
