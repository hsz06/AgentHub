import { AgentEvent } from './types'

export function parseJsonLines(text: string, normalize: (value: unknown) => AgentEvent | null) {
  const events: AgentEvent[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const event = normalize(JSON.parse(trimmed))
      if (event) events.push(event)
    } catch {
      events.push({ type: 'assistant_message', text: line })
    }
  }
  return events
}

export function eventsToText(events: AgentEvent[]) {
  const parts: string[] = []
  let assistantText = ''
  const flushAssistant = () => {
    if (!assistantText) return
    parts.push(assistantText)
    assistantText = ''
  }

  for (const event of events) {
    if (event.type === 'assistant_message') {
      assistantText += event.text
      continue
    }
    flushAssistant()
    if (event.type === 'status') parts.push(event.message)
    else if (event.type === 'command_output') parts.push(event.text)
    else if (event.type === 'command_started') parts.push(`$ ${event.command}`)
    else if (event.type === 'tool_call') parts.push(`tool: ${event.name}`)
    else if (event.type === 'usage') parts.push(`usage: input=${event.inputTokens ?? '-'} output=${event.outputTokens ?? '-'}`)
    else if (event.type === 'run_failed') parts.push(`failed: ${event.error}`)
    else if (event.type === 'run_completed') parts.push(event.summary)
  }
  flushAssistant()
  return parts.filter(Boolean).join('\n')
}
