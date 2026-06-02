import { Agent, Message as StoredMessage } from '@prisma/client'
import prisma from '../utils/prisma'
import { Message } from './agents/BaseAgent'
import { AgentManager } from './agents/AgentManager'

export async function buildContext(conversationId: string, agent: Agent): Promise<Message[]> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } })
  const stored = await prisma.message.findMany({
    where: { conversationId, status: { not: 'streaming' } },
    orderBy: { createdAt: 'asc' }
  })
  const pinned = stored.filter(message => message.isPinned)
  const ordinary = stored.filter(message => !message.isPinned)
  const systemParts = [agent.systemPrompt || 'You are a helpful AI agent.']
  const tools = parseTools(agent.tools)
  if (tools.length) {
    systemParts.push(`Available managed tools: ${tools.join(', ')}. For any proposed write, command, or deployment, output a fenced agenthub-tool JSON block such as {"tool":"propose_file_change","workspaceId":"...","filePath":"src/app.ts","baseHash":"...","content":"..."}. Never claim a write or execution occurred before approval.`)
  }
  if (conversation?.summary) systemParts.push(`Earlier conversation summary:\n${conversation.summary}`)
  if (pinned.length) systemParts.push(`Pinned long-term context:\n${pinned.map(formatStored).join('\n')}`)

  const messages: Message[] = [
    { role: 'system', content: systemParts.join('\n\n') },
    ...ordinary.map(toMessage)
  ]
  const manager = AgentManager.getInstance()
  const budget = manager.getTokenManager().getModelMaxTokens(agent.model || defaultModel(agent.adapterType))
  const truncated = manager.getTokenManager().truncateMessagesToFit(messages, budget, 4096)
  if (truncated.length < messages.length && ordinary.length > 4) {
    const removedCount = messages.length - truncated.length
    const removed = ordinary.slice(0, removedCount)
    const summary = removed.map(formatStored).join('\n').slice(0, 4000)
    await prisma.conversation.update({ where: { id: conversationId }, data: { summary } })
    truncated[0] = { role: 'system', content: `${systemParts.join('\n\n')}\n\nEarlier trimmed context:\n${summary}` }
  }
  return truncated
}

function defaultModel(adapterType: string) {
  if (adapterType === 'claude') return 'claude-3-5-sonnet-latest'
  return adapterType === 'mimo' ? 'mimo-v2.5-pro' : 'gpt-4o-mini'
}

function formatStored(message: StoredMessage) {
  return `${message.senderType}: ${message.content}`
}

function toMessage(message: StoredMessage): Message {
  return {
    role: message.senderType === 'user' ? 'user' : message.senderType === 'agent' ? 'assistant' : 'system',
    content: message.content
  }
}

function parseTools(value: string) {
  try { return JSON.parse(value || '[]') as string[] } catch { return [] }
}
