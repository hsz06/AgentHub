import { Agent } from '@prisma/client'
import prisma, { withDatabaseRetry } from '../../utils/prisma'
import { BaseAgent, ChatOptions, Message } from './BaseAgent'

const CLI_ADAPTERS = ['claude-code-cli', 'codex-cli', 'opencode-cli']

export function isCliAdapter(adapterType: string) {
  return CLI_ADAPTERS.includes(adapterType)
}

export function runtimeTypeForAdapter(adapterType: string) {
  if (adapterType === 'claude-code-cli') return 'claude-code'
  if (adapterType === 'codex-cli') return 'codex'
  if (adapterType === 'opencode-cli') return 'opencode'
  throw new Error(`Unsupported CLI adapter: ${adapterType}`)
}

export class CliAgent extends BaseAgent {
  constructor(private agent: Agent, private userId: string) {
    super(agent.name, agent.model || runtimeTypeForAdapter(agent.adapterType))
  }

  async normalChat(messages: Message[], options?: ChatOptions): Promise<string> {
    return this.streamChat(messages, () => undefined, options)
  }

  async streamChat(messages: Message[], onChunk: (chunk: string) => void, options?: ChatOptions): Promise<string> {
    if (!options?.conversationId) throw new Error('CLI Agent requires a conversation context')
    const workspaceId = options.workspaceId || await this.findConversationWorkspace(options.conversationId)
    if (!workspaceId) throw new Error('CLI Agent requires a managed workspace attached to this conversation. Create or import a workspace in Control Center, then bind it to the current conversation.')

    const prompt = messages.map(message => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n')
    if (!prompt.trim()) throw new Error('CLI Agent context is empty')
    const run = await prisma.cliRun.create({
      data: {
        userId: this.userId,
        agentId: this.agent.id,
        conversationId: options.conversationId,
        workspaceId,
        prompt,
        result: JSON.stringify({ source: 'chat', permissionProfile: 'safe_write' }),
        messageId: options.messageId || null
      }
    })

    let seen = 0
    const started = Date.now()
    const timeoutMs = Number(process.env.CLI_AGENT_WAIT_TIMEOUT_MS || 10 * 60 * 1000)
    while (Date.now() - started < timeoutMs) {
      const current = await withDatabaseRetry(() => prisma.cliRun.findUnique({ where: { id: run.id } }))
      if (!current) throw new Error('CLI run disappeared')
      if (current.stdout.length > seen) {
        const chunk = current.stdout.slice(seen)
        seen = current.stdout.length
        onChunk(chunk)
      }
      if (['completed', 'failed', 'cancelled'].includes(current.status)) {
        if (current.status === 'completed' && options.messageId) {
          await attachDiffCards(options.messageId, current.diffSummary)
        }
        const stdout = current.stdout.trim()
        const shouldShowResult = !stdout || !current.result?.includes('CLI completed with no file changes.')
        const output = [
          stdout,
          current.stderr ? `\n\nSTDERR:\n${current.stderr}` : '',
          shouldShowResult && current.result ? `\n\n${current.result}` : ''
        ].join('')
        if (current.status === 'failed') throw new Error(output.trim() || 'CLI Agent failed')
        return output.trim() || 'CLI Agent completed with no output.'
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    await prisma.cliRun.update({ where: { id: run.id }, data: { status: 'failed', result: 'Timed out while waiting for CLI worker', completedAt: new Date() } })
    throw new Error('Timed out while waiting for CLI worker')
  }

  private async findConversationWorkspace(conversationId: string) {
    const workspace = await prisma.workspace.findFirst({
      where: { userId: this.userId, conversationId },
      orderBy: { updatedAt: 'desc' }
    })
    return workspace?.id
  }
}

async function attachDiffCards(messageId: string, diffSummary: string) {
  let changes: Array<{ filePath: string; approvalId: string; oldCode: string; newCode: string }> = []
  try { changes = JSON.parse(diffSummary || '[]') } catch { changes = [] }
  if (!changes.length) return
  await prisma.message.update({
    where: { id: messageId },
    data: {
      metadata: JSON.stringify({
        preview_cards: changes.map(change => ({
          type: 'code-diff',
          title: change.filePath,
          description: 'CLI generated change awaiting approval',
          data: { approvalId: change.approvalId, fileName: change.filePath, oldCode: change.oldCode, newCode: change.newCode }
        }))
      })
    }
  }).catch(() => undefined)
}
