import { AgentAdapter, AgentEvent, AgentRunRequest } from './types'
import { renderTemplate, shellQuote } from './utils'

export class OpenCodeAdapter implements AgentAdapter {
  provider = 'opencode' as const

  buildCommand(request: AgentRunRequest, runtime: { dockerImage: string; commandTemplate: string; envVarName: string; apiKey: string }) {
    const command = runtime.commandTemplate.includes('{{task}}')
      ? renderTemplate(runtime.commandTemplate, {
        task: shellQuote(request.task),
        promptFile: '/workspace/.agenthub/prompt.txt',
        model: request.model
      })
      : runtime.commandTemplate
    return {
      image: runtime.dockerImage,
      command,
      env: { [runtime.envVarName]: runtime.apiKey },
      network: request.permissions.network === 'deny' ? 'none' as const : 'bridge' as const
    }
  }

  normalizeStdout(text: string) {
    return text.split(/\r?\n/).filter(Boolean).map(line => ({ type: 'assistant_message', text: line }) as AgentEvent)
  }

  normalizeStderr(text: string) {
    return text.split(/\r?\n/).filter(Boolean).map(message => ({ type: 'status', message }) as AgentEvent)
  }
}
