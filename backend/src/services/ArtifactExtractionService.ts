import prisma from '../utils/prisma'
import { emitToUser } from './RealtimeHub'
import { listTree, readFileContent } from './WorkspaceFileService'
import { isAllowedCommand } from './WorkspaceCommandService'

interface ToolProposal {
  tool?: string
  action?: string
  params?: Partial<ToolProposal>
  workspaceId?: string
  filePath?: string
  baseHash?: string
  content?: string
  command?: string
  name?: string
  exposedPort?: number
}

interface OriginContext {
  conversationId?: string
  agentId?: string
  runId?: string
  taskId?: string
  allowedTools?: string[]
}

export async function attachGeneratedArtifacts(userId: string, messageId: string, content: string, origin: OriginContext = {}) {
  const definitions = [
    { type: 'web', language: 'html', name: 'generated-preview.html', mimeType: 'text/html', cardType: 'web-preview' },
    { type: 'document', language: 'markdown', name: 'generated-document.md', mimeType: 'text/markdown', cardType: 'file-attachment' },
    { type: 'slides', language: 'slides', name: 'generated-slides', mimeType: 'application/json', cardType: 'slides' }
  ]
  const cards: unknown[] = []
  let approvalCreated = false
  for (const definition of definitions) {
    const expression = new RegExp(`\`\`\`${definition.language}\\s*\\n([\\s\\S]*?)\`\`\``, 'i')
    const match = expression.exec(content)
    if (!match) continue
    const artifact = await prisma.artifact.create({
      data: {
        name: definition.name,
        type: definition.type,
        mimeType: definition.mimeType,
        userId,
        versions: { create: { version: 1, content: match[1], createdBy: userId, messageId } }
      },
      include: { versions: true }
    })
    const version = artifact.versions[0]
    cards.push({
      type: definition.cardType,
      title: artifact.name,
      data: definition.type === 'web'
        ? { artifactId: artifact.id, versionId: version.id }
        : { artifactId: artifact.id, versionId: version.id, fileName: artifact.name, fileType: definition.type === 'slides' ? 'Slides' : 'Markdown' }
    })
  }

  for (const proposal of collectToolProposals(content)) {
    proposal.tool = normalizeToolName(proposal.tool)
    if (proposal.tool && origin.allowedTools && !origin.allowedTools.includes(proposal.tool)) continue
    const workspace = proposal.workspaceId
      ? await prisma.workspace.findFirst({ where: { id: proposal.workspaceId, userId } })
      : null
    if ((proposal.tool === 'propose_file_change' || proposal.tool === 'propose_command' || proposal.tool === 'propose_deployment') && !workspace) continue
    if (proposal.tool === 'propose_file_change' && proposal.filePath && proposal.content !== undefined) {
      const previous = await readFileContent(userId, workspace!.id, proposal.filePath).catch(() => null)
      const approval = await prisma.toolApproval.create({
        data: {
          userId,
          workspaceId: workspace!.id,
          type: 'apply_diff',
          title: `Apply Agent change to ${proposal.filePath}`,
          payload: JSON.stringify({ filePath: proposal.filePath, baseHash: proposal.baseHash, content: proposal.content, oldContent: previous?.content || '', ...origin, sourceMessageId: messageId })
        }
      })
      emitToUser(userId, 'tool:approval-created', approval)
      approvalCreated = true
      cards.push({ type: 'code-diff', title: proposal.filePath, description: 'Awaiting approval', data: { approvalId: approval.id, oldCode: previous?.content || '', newCode: proposal.content, fileName: proposal.filePath } })
    }
    if (proposal.tool === 'propose_command' && proposal.command) {
      if (!isAllowedCommand(proposal.command)) continue
      const approval = await prisma.toolApproval.create({
        data: { userId, workspaceId: workspace!.id, type: 'run_command', title: `Run ${proposal.command}`, payload: JSON.stringify({ command: proposal.command, ...origin, sourceMessageId: messageId }) }
      })
      emitToUser(userId, 'tool:approval-created', approval)
      approvalCreated = true
    }
    if (proposal.tool === 'propose_deployment') {
      const deployment = await prisma.deployment.create({
        data: {
          name: proposal.name || `${workspace!.name} deployment`,
          type: 'fullstack',
          workspaceId: workspace!.id,
          userId,
          exposedPort: Number(proposal.exposedPort || 3000),
          approvals: {
            create: {
              userId,
              workspaceId: workspace!.id,
              type: 'deployment',
              title: `Deploy ${proposal.name || workspace!.name}`,
              payload: JSON.stringify({ ...proposal, ...origin, sourceMessageId: messageId })
            }
          }
        },
        include: { approvals: true }
      })
      emitToUser(userId, 'tool:approval-created', deployment.approvals[0])
      approvalCreated = true
      cards.push({ type: 'deployment-status', title: deployment.name, data: { deploymentId: deployment.id, status: 'pending' } })
    }
  }

  if (!cards.length) return { message: null, approvalCreated }
  const message = await prisma.message.update({
    where: { id: messageId },
    data: { metadata: JSON.stringify({ preview_cards: cards }) }
  })
  return { message, approvalCreated }
}

export async function executeReadToolRequests(userId: string, content: string, allowedTools: string[] = []) {
  const results: string[] = []
  for (const proposal of collectToolProposals(content)) {
    proposal.tool = normalizeToolName(proposal.tool)
    if (!proposal.tool || !allowedTools.includes(proposal.tool)) continue
    if (!proposal.workspaceId) continue
    if (proposal.tool === 'list_workspace_files') {
      const entries = await listTree(userId, proposal.workspaceId)
      results.push(`list_workspace_files result:\n${entries.map(entry => `${entry.type}: ${entry.path}`).join('\n').slice(0, 8000)}`)
    }
    if (proposal.tool === 'read_workspace_file' && proposal.filePath) {
      const file = await readFileContent(userId, proposal.workspaceId, proposal.filePath)
      results.push(`read_workspace_file result for ${file.path} (sha256 ${file.hash}):\n${file.content.slice(0, 12000)}`)
    }
  }
  return results.join('\n\n')
}

function collectToolProposals(content: string) {
  const proposals: ToolProposal[] = []
  const proposalPattern = /\`\`\`(agenthub-tool|json)\s*([\s\S]*?)\`\`\`/gi
  for (const match of content.matchAll(proposalPattern)) {
    let proposal: ToolProposal
    try { proposal = JSON.parse(match[2]) as ToolProposal } catch { continue }
    proposal = normalizeProposal(proposal)
    if (proposal.tool) proposals.push(proposal)
  }
  return proposals
}

function normalizeProposal(proposal: ToolProposal) {
  const params = proposal.params || {}
  const normalized: ToolProposal = { ...proposal, ...params }
  const actionTool = normalizeActionName(proposal.action)
  const directTool = normalizeToolName(proposal.tool)
  normalized.tool = actionTool || (directTool === 'agenthub-tool' ? undefined : directTool)
  if (!normalized.tool && normalized.workspaceId && normalized.filePath && normalized.content !== undefined) {
    normalized.tool = 'propose_file_change'
  }
  return normalized
}

function normalizeToolName(tool?: string) {
  const aliases: Record<string, string> = {
    'agenthub-tool': 'agenthub-tool',
    workspace_edit: 'propose_file_change',
    edit_workspace_file: 'propose_file_change',
    apply_file_change: 'propose_file_change',
    file_change: 'propose_file_change',
    create_file: 'propose_file_change',
    update_file: 'propose_file_change',
    file_write: 'propose_file_change',
    write_file: 'propose_file_change',
    command: 'propose_command',
    run_command: 'propose_command',
    deploy: 'propose_deployment',
    deployment: 'propose_deployment',
    list_files: 'list_workspace_files',
    read_file: 'read_workspace_file'
  }
  if (!tool) return tool
  return aliases[tool] || tool
}

function normalizeActionName(action?: string) {
  if (!action) return undefined
  return normalizeToolName(action.replace(/-/g, '_'))
}
