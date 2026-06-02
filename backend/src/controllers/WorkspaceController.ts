import { Response } from 'express'
import path from 'path'
import crypto from 'crypto'
import prisma from '../utils/prisma'
import { AuthenticatedRequest } from '../middleware/auth'
import { deleteWorkspaceDirectory, ensureWorkspaceDirectory, exportArchive, getOwnedWorkspace, importArchive, listTree, readFileContent } from '../services/WorkspaceFileService'

function workspaceRoot(userId: string, workspaceId: string) {
  const base = process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), 'data', 'workspaces')
  return path.join(base, userId, workspaceId)
}

export async function listWorkspaces(req: AuthenticatedRequest, res: Response) {
  const workspaces = await prisma.workspace.findMany({
    where: { userId: req.userId! },
    include: { artifacts: true },
    orderBy: { updatedAt: 'desc' }
  })
  res.json(workspaces)
}

export async function createWorkspace(req: AuthenticatedRequest, res: Response) {
  const name = String(req.body.name || '').trim()
  const conversationId = req.body.conversationId ? String(req.body.conversationId) : undefined
  if (!name) return res.status(400).json({ error: 'Workspace name is required' })
  if (conversationId && !(await prisma.conversation.findFirst({ where: { id: conversationId, userId: req.userId! } }))) {
    return res.status(400).json({ error: 'Conversation not found' })
  }
  const id = crypto.randomUUID()
  const rootPath = workspaceRoot(req.userId!, id)
  await ensureWorkspaceDirectory(rootPath)
  const workspace = await prisma.workspace.create({ data: { id, name, userId: req.userId!, conversationId, rootPath } })
  res.status(201).json(workspace)
}

export async function getTree(req: AuthenticatedRequest, res: Response) {
  try { res.json(await listTree(req.userId!, req.params.id)) } catch (error) { res.status(404).json({ error: String(error) }) }
}

export async function getFile(req: AuthenticatedRequest, res: Response) {
  try { res.json(await readFileContent(req.userId!, req.params.id, String(req.query.path || ''))) } catch (error) { res.status(404).json({ error: String(error) }) }
}

export async function importWorkspaceArchive(req: AuthenticatedRequest, res: Response) {
  const encoded = String(req.body.contentBase64 || '')
  if (!encoded) return res.status(400).json({ error: 'ZIP content is required' })
  try { res.json(await importArchive(req.userId!, req.params.id, encoded)) } catch (error) { res.status(400).json({ error: String(error) }) }
}

export async function exportWorkspaceArchive(req: AuthenticatedRequest, res: Response) {
  try {
    const { workspace, buffer } = await exportArchive(req.userId!, req.params.id)
    res.setHeader('Content-Disposition', `attachment; filename="${workspace.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip"`)
    res.type('application/zip').send(buffer)
  } catch (error) {
    res.status(404).json({ error: String(error) })
  }
}

export async function updateWorkspace(req: AuthenticatedRequest, res: Response) {
  const workspace = await prisma.workspace.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' })
  const data: { conversationId?: string | null; name?: string } = {}
  if (req.body.conversationId !== undefined) {
    const conversationId = req.body.conversationId ? String(req.body.conversationId) : null
    if (conversationId && !(await prisma.conversation.findFirst({ where: { id: conversationId, userId: req.userId! } }))) {
      return res.status(400).json({ error: 'Conversation not found' })
    }
    data.conversationId = conversationId
  }
  if (typeof req.body.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim()
  res.json(await prisma.workspace.update({ where: { id: workspace.id }, data }))
}

export async function deleteWorkspace(req: AuthenticatedRequest, res: Response) {
  const workspace = await getOwnedWorkspace(req.userId!, req.params.id).catch(() => null)
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' })
  await prisma.workspace.delete({ where: { id: workspace.id } })
  await deleteWorkspaceDirectory(workspace.rootPath)
  res.status(204).send()
}
