import { AgentAdapter, AgentEvent, AgentRunRequest } from './types'

export class OpenCodeAdapter implements AgentAdapter {
  provider = 'opencode' as const

  buildCommand(request: AgentRunRequest, runtime: { executablePath: string; envVarName: string; apiKey?: string }) {
    const env: Record<string, string> = {}
    if (runtime.apiKey) env[runtime.envVarName] = runtime.apiKey
    return {
      executablePath: runtime.executablePath,
      args: ['run', request.task],
      env
    }
  }

  normalizeStdout(text: string) {
    return text.split(/\r?\n/).filter(Boolean).map(line => ({ type: 'assistant_message', text: line }) as AgentEvent)
  }

  normalizeStderr(text: string) {
    return text.split(/\r?\n/).filter(Boolean).map(message => ({ type: 'status', message }) as AgentEvent)
  }
}
