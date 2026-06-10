import { Response } from 'express'
import prisma from '../utils/prisma'
import { AuthenticatedRequest, issuePreviewToken } from '../middleware/auth'
import { applyApprovedFileChange } from '../services/WorkspaceFileService'
import { createMergeCandidate } from '../services/ConflictMergeService'
import { emitToConversation, emitToUser, getRealtimeServer } from '../services/RealtimeHub'
import { Orchestrator } from '../services/Orchestrator'
import { isAllowedCommand } from '../services/WorkspaceCommandService'

const approvalTypes = ['apply_diff', 'run_command', 'deployment']

export async function listApprovals(req: AuthenticatedRequest, res: Response) {
  const approvals = await prisma.toolApproval.findMany({
    where: { userId: req.userId!, ...(req.query.status ? { status: String(req.query.status) } : {}) },
    include: { deployment: true, workspace: true },
    orderBy: { createdAt: 'desc' }
  })
  res.json(approvals)
}

export async function createApproval(req: AuthenticatedRequest, res: Response) {
  const { type, title, payload, workspaceId } = req.body
  if (!approvalTypes.includes(type) || !title) return res.status(400).json({ error: 'Valid approval type and title are required' })
  if (workspaceId && !(await prisma.workspace.findFirst({ where: { id: workspaceId, userId: req.userId! } }))) {
    return res.status(400).json({ error: 'Workspace not found' })
  }
  if (type === 'run_command' && !isAllowedCommand(String(payload?.command || ''))) {
    return res.status(400).json({ error: 'Command is not in the sandbox allowlist' })
  }
  const approval = await prisma.toolApproval.create({
    data: { type, title, payload: JSON.stringify(payload || {}), userId: req.userId!, workspaceId: workspaceId || null }
  })
  emitToUser(req.userId!, 'tool:approval-created', approval)
  res.status(201).json(approval)
}

export async function resolveApproval(req: AuthenticatedRequest, res: Response) {
  const action = req.body.action as 'approve' | 'reject'
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' })
  const approval = await prisma.toolApproval.findFirst({ where: { id: req.params.id, userId: req.userId!, status: 'pending' } })
  if (!approval) return res.status(404).json({ error: 'Pending approval not found' })
  const origin = JSON.parse(approval.payload || '{}') as { conversationId?: string; taskId?: string; runId?: string }
  if (action === 'reject') {
    const rejected = await prisma.toolApproval.update({ where: { id: approval.id }, data: { status: 'rejected', resolvedAt: new Date(), result: 'Rejected by user' } })
    await recordToolOutcome(req.userId!, origin, approval.title, 'Rejected by user', false)
    emitToUser(req.userId!, 'tool:result', rejected)
    return res.json(rejected)
  }
  try {
    const payload = JSON.parse(approval.payload || '{}') as Record<string, string>
    let result = 'Approved'
    if (approval.type === 'apply_diff') {
      if (!approval.workspaceId || !payload.filePath || payload.content === undefined) throw new Error('File change payload is incomplete')
      const changed = await applyApprovedFileChange(req.userId!, approval.workspaceId, payload.filePath, payload.content, payload.baseHash)
      if (changed.conflict) {
        const mergeApproval = await createMergeCandidate(req.userId!, approval.workspaceId, payload.filePath, changed.current || '', changed.currentHash || '', payload.content, origin)
        const conflicted = await prisma.toolApproval.update({
          where: { id: approval.id },
          data: { status: 'conflict', resolvedAt: new Date(), result: `Conflict detected; merge approval ${mergeApproval.id} created` }
        })
        emitToUser(req.userId!, 'tool:approval-created', mergeApproval)
        return res.json(conflicted)
      }
      await recordCodeArtifactVersion(req.userId!, approval.workspaceId, payload.filePath, payload.content)
      result = 'File change applied to managed workspace'
    }
    if (approval.type === 'run_command') {
      if (!approval.workspaceId || !payload.command) throw new Error('Command payload is incomplete')
      const queued = await prisma.toolApproval.update({
        where: { id: approval.id },
        data: { status: 'queued', resolvedAt: new Date(), result: 'Command queued for local worker execution' }
      })
      await recordToolOutcome(req.userId!, origin, approval.title, queued.result || 'Command queued', true, false)
      emitToUser(req.userId!, 'tool:result', queued)
      return res.json(queued)
    }
    if (approval.deploymentId) {
      const deployment = await prisma.deployment.findUniqueOrThrow({ where: { id: approval.deploymentId } })
      const updatedDeployment = await prisma.deployment.update({
        where: { id: deployment.id },
        data: deployment.type === 'static'
          ? { status: 'success', previewUrl: `/api/deployments/${deployment.id}/preview?token=${encodeURIComponent(issuePreviewToken(req.userId!, deployment.id))}` }
          : { status: 'queued' }
      })
      result = deployment.type === 'static' ? 'Static preview published' : 'Deployment queued for local worker'
      emitToUser(req.userId!, 'deployment:state', {
        deploymentId: deployment.id,
        status: updatedDeployment.status,
        previewUrl: updatedDeployment.previewUrl,
        type: updatedDeployment.type
      })
    }
    const approved = await prisma.toolApproval.update({ where: { id: approval.id }, data: { status: 'approved', resolvedAt: new Date(), result } })
    await recordToolOutcome(req.userId!, origin, approval.title, result, true)
    emitToUser(req.userId!, 'tool:result', approved)
    res.json(approved)
  } catch (error) {
    const failed = await prisma.toolApproval.update({
      where: { id: approval.id },
      data: { status: 'failed', resolvedAt: new Date(), result: error instanceof Error ? error.message : String(error) }
    })
    await recordToolOutcome(req.userId!, origin, approval.title, failed.result || 'Approval failed', false)
    emitToUser(req.userId!, 'tool:result', failed)
    res.status(422).json(failed)
  }
}

async function recordCodeArtifactVersion(userId: string, workspaceId: string, filePath: string, content: string) {
  let artifact = await prisma.artifact.findFirst({ where: { userId, workspaceId, name: filePath, type: 'code' } })
  if (!artifact) {
    await prisma.artifact.create({
      data: {
        userId,
        workspaceId,
        name: filePath,
        type: 'code',
        mimeType: 'text/plain',
        versions: { create: { version: 1, content, createdBy: userId } }
      }
    })
    return
  }
  const latest = await prisma.artifactVersion.findFirst({ where: { artifactId: artifact.id }, orderBy: { version: 'desc' } })
  await prisma.artifactVersion.create({
    data: { artifactId: artifact.id, version: (latest?.version || 0) + 1, content, createdBy: userId }
  })
}

async function recordToolOutcome(
  userId: string,
  origin: { conversationId?: string; taskId?: string; runId?: string },
  title: string,
  result: string,
  succeeded: boolean,
  completeTask = true
) {
  if (origin.taskId && completeTask) {
    await prisma.orchestrationTask.updateMany({
      where: { id: origin.taskId },
      data: { status: succeeded ? 'completed' : 'failed', completedAt: new Date(), output: result }
    })
    emitToConversation(origin.conversationId || '', 'task:state', { taskId: origin.taskId, runId: origin.runId, status: succeeded ? 'completed' : 'failed' })
  }
  if (origin.conversationId) {
    const toolMessage = await prisma.message.create({
      data: {
        conversationId: origin.conversationId,
        senderType: 'system',
        senderId: userId,
        messageType: 'tool-result',
        content: `${title}: ${result}`,
        status: succeeded ? 'completed' : 'failed'
      }
    })
    emitToConversation(origin.conversationId, 'message:created', toolMessage)
  }
  if (origin.runId && completeTask) {
    const server = getRealtimeServer()
    if (server) await Orchestrator.getInstance().resumeAfterApproval(userId, origin.runId, server)
  }
}
