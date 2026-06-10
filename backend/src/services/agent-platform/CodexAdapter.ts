import { AgentAdapter, AgentEvent, AgentRunRequest } from './types'
import { parseJsonLines } from './utils'

export class CodexAdapter implements AgentAdapter {
  provider = 'codex' as const

  buildCommand(request: AgentRunRequest, runtime: { executablePath: string; envVarName: string; apiKey?: string }) {
    const sandbox = request.permissions.filesystem === 'workspace_write' ? 'workspace-write' : 'read-only'
    const env: Record<string, string> = {}
    if (runtime.apiKey) env.OPENAI_API_KEY = runtime.apiKey
    return {
      executablePath: runtime.executablePath,
      args: ['exec', '--cd', request.workspace.path, '--json', '--sandbox', sandbox, request.task],
      env
    }
  }

  normalizeStdout(text: string, runId: string) {
    return parseJsonLines(text, value => normalizeCodexEvent(value, runId))
  }

  normalizeStderr(text: string) {
    return text.split(/\r?\n/).filter(Boolean).map(message => ({ type: 'status', message }) as AgentEvent)
  }
}

function normalizeCodexEvent(value: unknown, runId: string): AgentEvent | null {
  const event = value as Record<string, unknown>
  const type = String(event.type || event.event || event.msg?.constructor?.name || '')
  const message = event.message as Record<string, unknown> | undefined
  if (type.includes('assistant') || event.text || message?.content) {
    return { type: 'assistant_message', text: String(event.text || message?.content || event.content || '') }
  }
  if (type.includes('tool') || type.includes('function')) {
    return { type: 'tool_call', name: String(event.name || event.tool || 'codex_tool'), input: event.input || event.arguments }
  }
  if (type.includes('command')) {
    return { type: 'command_started', command: String(event.command || event.cmd || '') }
  }
  if (type.includes('completed') || type.includes('final')) {
    return { type: 'run_completed', summary: String(event.summary || event.text || 'Codex completed') }
  }
  if (type.includes('error')) return { type: 'run_failed', error: String(event.error || event.message || 'Codex failed') }
  if (type) return { type: 'status', message: JSON.stringify(event) }
  return { type: 'run_started', runId, provider: 'codex' }
}
