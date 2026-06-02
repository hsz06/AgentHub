import { AgentAdapter, AgentEvent, AgentRunRequest } from './types'
import { parseJsonLines, renderTemplate, shellQuote } from './utils'

export class ClaudeCodeAdapter implements AgentAdapter {
  provider = 'claude_code' as const

  buildCommand(request: AgentRunRequest, runtime: { dockerImage: string; commandTemplate: string; envVarName: string; apiKey: string }) {
    const maxTurns = request.limits?.maxTurns || 10
    const command = runtime.commandTemplate.includes('{{task}}')
      ? renderTemplate(runtime.commandTemplate, {
        task: shellQuote(request.task),
        promptFile: '/workspace/.agenthub/prompt.txt',
        maxTurns,
        model: request.model
      })
      : runtime.commandTemplate
    return {
      image: runtime.dockerImage,
      command,
      env: { [runtime.envVarName]: runtime.apiKey, ANTHROPIC_API_KEY: runtime.apiKey },
      network: request.permissions.network === 'deny' ? 'none' as const : 'bridge' as const
    }
  }

  normalizeStdout(text: string, runId: string) {
    return parseJsonLines(text, value => normalizeClaudeEvent(value, runId))
  }

  normalizeStderr(text: string) {
    return text.split(/\r?\n/).filter(Boolean).map(message => ({ type: 'status', message }) as AgentEvent)
  }
}

function normalizeClaudeEvent(value: unknown, runId: string): AgentEvent | null {
  const event = value as Record<string, unknown>
  const type = String(event.type || event.event || '')
  if (type.includes('assistant') || event.message || event.text) {
    return { type: 'assistant_message', text: String(event.text || event.message || event.content || '') }
  }
  if (type.includes('tool')) {
    return { type: 'tool_call', name: String(event.name || event.tool || 'claude_tool'), input: event.input }
  }
  if (type.includes('result') || type.includes('completed')) {
    return { type: 'run_completed', summary: String(event.summary || event.result || 'Claude Code completed') }
  }
  if (type.includes('usage')) {
    return {
      type: 'usage',
      inputTokens: numberOrUndefined(event.input_tokens || event.inputTokens),
      outputTokens: numberOrUndefined(event.output_tokens || event.outputTokens)
    }
  }
  if (type.includes('error')) return { type: 'run_failed', error: String(event.error || event.message || 'Claude Code failed') }
  if (type) return { type: 'status', message: JSON.stringify(event) }
  return { type: 'run_started', runId, provider: 'claude_code' }
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
