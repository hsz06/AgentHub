import { AgentAdapter, AgentEvent, AgentRunRequest } from './types'

export class ClaudeCodeAdapter implements AgentAdapter {
  provider = 'claude_code' as const

  buildCommand(request: AgentRunRequest, runtime: { executablePath: string; envVarName: string; apiKey?: string }) {
    const maxTurns = request.limits?.maxTurns || 10
    const tools = request.permissions.filesystem === 'workspace_write'
      ? 'Read,Glob,Grep,Edit,Write'
      : 'Read,Glob,Grep'
    const permissionMode = request.permissions.filesystem === 'workspace_write' ? 'acceptEdits' : 'plan'
    const env: Record<string, string> = {}
    if (runtime.apiKey) env.ANTHROPIC_API_KEY = runtime.apiKey
    return {
      executablePath: runtime.executablePath,
      args: [
        '-p', request.task,
        '--output-format', 'stream-json',
        '--verbose',
        '--no-session-persistence',
        '--tools', tools,
        '--permission-mode', permissionMode,
        '--max-turns', String(maxTurns)
      ],
      env
    }
  }

  normalizeStdout(text: string, runId: string) {
    return coalesceAssistantText(parseClaudeJsonValues(text).map(normalizeClaudeEvent).filter(Boolean) as AgentEvent[])
  }

  normalizeStderr(text: string) {
    return text.split(/\r?\n/).filter(Boolean).map(message => ({ type: 'status', message }) as AgentEvent)
  }
}

function normalizeClaudeEvent(value: unknown): AgentEvent | null {
  const event = value as Record<string, unknown>
  const type = String(event.type || '')
  if (type === 'assistant') {
    const message = event.message as Record<string, unknown> | undefined
    const content = Array.isArray(message?.content) ? message.content : []
    const text = content
      .map(block => {
        const item = block as Record<string, unknown>
        return item.type === 'text' && typeof item.text === 'string' ? item.text : ''
      })
      .join('')
    return text ? { type: 'assistant_message', text } : null
  }
  if (type === 'stream_event') {
    const streamed = event.event as Record<string, unknown>
    if (streamed?.type === 'content_block_delta') {
      const delta = streamed.delta as Record<string, unknown>
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        return { type: 'assistant_message', text: delta.text }
      }
    }
    if (streamed?.type === 'content_block_start') {
      const content = streamed.content_block as Record<string, unknown>
      if (content?.type === 'tool_use') {
        return { type: 'tool_call', name: String(content.name || 'claude_tool'), input: content.input }
      }
    }
    return null
  }
  if (type.includes('tool')) {
    return { type: 'tool_call', name: String(event.name || event.tool || 'claude_tool'), input: event.input }
  }
  if (type === 'result') {
    return event.is_error ? { type: 'run_failed', error: String(event.result || 'Claude Code failed') } : null
  }
  if (type.includes('usage')) {
    return {
      type: 'usage',
      inputTokens: numberOrUndefined(event.input_tokens || event.inputTokens),
      outputTokens: numberOrUndefined(event.output_tokens || event.outputTokens)
    }
  }
  if (type.includes('error')) return { type: 'run_failed', error: String(event.error || event.message || 'Claude Code failed') }
  return null
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseClaudeJsonValues(text: string) {
  const values: unknown[] = []
  let start = -1
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (start < 0) {
      if (character !== '{') continue
      start = index
      depth = 1
      continue
    }
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') quoted = true
    else if (character === '{') depth += 1
    else if (character === '}') depth -= 1
    if (depth !== 0) continue
    try {
      values.push(JSON.parse(text.slice(start, index + 1)))
    } catch {
      // Ignore malformed protocol fragments rather than exposing raw JSON to users.
    }
    start = -1
  }
  return values
}

function coalesceAssistantText(events: AgentEvent[]) {
  return events.reduce<AgentEvent[]>((result, event) => {
    const previous = result[result.length - 1]
    if (event.type === 'assistant_message' && previous?.type === 'assistant_message') {
      previous.text += event.text
    } else {
      result.push(event)
    }
    return result
  }, [])
}
