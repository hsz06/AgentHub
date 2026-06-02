import { AgentEvent } from './types'

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function renderTemplate(template: string, values: Record<string, string | number | undefined>) {
  return Object.entries(values).reduce((result, [key, value]) => result.split(`{{${key}}}`).join(String(value ?? '')), template)
}

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
  return events.map(event => {
    if (event.type === 'assistant_message') return event.text
    if (event.type === 'status') return event.message
    if (event.type === 'command_output') return event.text
    if (event.type === 'command_started') return `$ ${event.command}`
    if (event.type === 'tool_call') return `tool: ${event.name}`
    if (event.type === 'usage') return `usage: input=${event.inputTokens ?? '-'} output=${event.outputTokens ?? '-'}`
    if (event.type === 'run_failed') return `failed: ${event.error}`
    if (event.type === 'run_completed') return event.summary
    return ''
  }).filter(Boolean).join('\n')
}
