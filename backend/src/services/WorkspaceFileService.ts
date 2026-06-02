import AdmZip from 'adm-zip'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import prisma from '../utils/prisma'

const MAX_IMPORT_FILES = 2000
const MAX_IMPORT_BYTES = 25 * 1024 * 1024

export async function ensureWorkspaceDirectory(rootPath: string) {
  await fs.mkdir(rootPath, { recursive: true })
}

export async function getOwnedWorkspace(userId: string, workspaceId: string) {
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } })
  if (!workspace) throw new Error('Workspace not found')
  await ensureWorkspaceDirectory(workspace.rootPath)
  return workspace
}

export function safeFilePath(rootPath: string, relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const target = path.resolve(rootPath, normalized)
  const root = path.resolve(rootPath)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid workspace path')
  return { target, normalized }
}

export async function listTree(userId: string, workspaceId: string) {
  const workspace = await getOwnedWorkspace(userId, workspaceId)
  const entries: Array<{ path: string; type: 'file' | 'directory'; size?: number }> = []
  async function scan(directory: string) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      if (item.name === '.git' || item.name === 'node_modules') continue
      const absolute = path.join(directory, item.name)
      const relative = path.relative(workspace.rootPath, absolute).replace(/\\/g, '/')
      if (item.isDirectory()) {
        entries.push({ path: relative, type: 'directory' })
        await scan(absolute)
      } else {
        const stat = await fs.stat(absolute)
        entries.push({ path: relative, type: 'file', size: stat.size })
      }
    }
  }
  await scan(workspace.rootPath)
  return entries
}

export async function readFileContent(userId: string, workspaceId: string, relativePath: string) {
  const workspace = await getOwnedWorkspace(userId, workspaceId)
  const { target, normalized } = safeFilePath(workspace.rootPath, relativePath)
  const content = await fs.readFile(target, 'utf8')
  return { path: normalized, content, hash: hash(content) }
}

export async function importArchive(userId: string, workspaceId: string, encoded: string) {
  const workspace = await getOwnedWorkspace(userId, workspaceId)
  const zip = new AdmZip(Buffer.from(encoded, 'base64'))
  let files = 0
  let bytes = 0
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const { target, normalized } = safeFilePath(workspace.rootPath, entry.entryName)
    if (normalized.split('/').includes('node_modules') || normalized.startsWith('.git/')) continue
    const content = entry.getData()
    files += 1
    bytes += content.length
    if (files > MAX_IMPORT_FILES || bytes > MAX_IMPORT_BYTES) throw new Error('Workspace archive exceeds import limits')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
    if (!content.includes(0)) {
      const text = content.toString('utf8')
      await prisma.workspaceFileRevision.create({
        data: { workspaceId, userId, filePath: normalized, contentHash: hash(text), content: text, operation: 'import' }
      })
    }
  }
  return { files }
}

export async function deleteWorkspaceDirectory(rootPath: string) {
  const managedRoot = path.resolve(process.env.WORKSPACE_ROOT || 'data/workspaces')
  const target = path.resolve(rootPath)
  if (target === managedRoot || !target.startsWith(`${managedRoot}${path.sep}`)) throw new Error('Workspace path is outside managed storage')
  await fs.rm(target, { recursive: true, force: true })
}

export async function exportArchive(userId: string, workspaceId: string) {
  const workspace = await getOwnedWorkspace(userId, workspaceId)
  const zip = new AdmZip()
  const entries = await listTree(userId, workspaceId)
  for (const entry of entries.filter(item => item.type === 'file')) {
    const { target } = safeFilePath(workspace.rootPath, entry.path)
    zip.addFile(entry.path, await fs.readFile(target))
  }
  return { workspace, buffer: zip.toBuffer() }
}

export async function applyApprovedFileChange(userId: string, workspaceId: string, filePath: string, content: string, baseHash?: string) {
  const workspace = await getOwnedWorkspace(userId, workspaceId)
  const { target, normalized } = safeFilePath(workspace.rootPath, filePath)
  let current = ''
  try { current = await fs.readFile(target, 'utf8') } catch { current = '' }
  const currentHash = hash(current)
  if (baseHash && currentHash !== baseHash) return { conflict: true, current, currentHash }
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf8')
  const revision = await prisma.workspaceFileRevision.create({
    data: {
      workspaceId,
      userId,
      filePath: normalized,
      baseHash: currentHash,
      contentHash: hash(content),
      content,
      operation: current ? 'update' : 'create'
    }
  })
  return { conflict: false, revision }
}

export function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}
