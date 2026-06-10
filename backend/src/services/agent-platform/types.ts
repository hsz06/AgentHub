export type AgentProvider = 'claude_code' | 'codex' | 'opencode'

export type AgentRunMode = 'plan' | 'review' | 'patch' | 'test' | 'fix_ci'
export type PermissionProfileName = 'readonly' | 'safe_write' | 'autonomous'

export function permissionProfile(name: PermissionProfileName = 'safe_write') {
  if (name === 'readonly') {
    return { filesystem: 'read_only' as const, shell: 'deny' as const, network: 'deny' as const, requireApproval: true }
  }
  if (name === 'autonomous') {
    return { filesystem: 'workspace_write' as const, shell: 'allow' as const, network: 'allow' as const, requireApproval: true }
  }
  return { filesystem: 'workspace_write' as const, shell: 'allowlist' as const, network: 'allow' as const, requireApproval: true }
}

export interface AgentRunRequest {
  runId: string
  provider: AgentProvider
  task: string
  mode: AgentRunMode
  workspace: {
    path: string
    readonly?: boolean
  }
  permissions: {
    filesystem: 'read_only' | 'workspace_write'
    shell: 'deny' | 'allowlist' | 'allow'
    network: 'deny' | 'allowlist' | 'allow'
    requireApproval?: boolean
  }
  model?: string
  limits?: {
    timeoutSec?: number
    maxTurns?: number
    maxCostUsd?: number
  }
  metadata?: Record<string, string>
}

export type AgentEvent =
  | { type: 'run_started'; runId: string; provider: AgentProvider }
  | { type: 'status'; message: string }
  | { type: 'assistant_message'; text: string }
  | { type: 'tool_call'; name: string; input?: unknown }
  | { type: 'command_started'; command: string }
  | { type: 'command_output'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'file_changed'; path: string; changeType: 'created' | 'modified' | 'deleted' }
  | { type: 'approval_requested'; reason: string; action: unknown }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number }
  | { type: 'run_completed'; summary: string; diff?: string }
  | { type: 'run_failed'; error: string }

export interface RunnerCommand {
  executablePath: string
  args: string[]
  env: Record<string, string>
}

export interface AgentAdapter {
  provider: AgentProvider
  buildCommand(request: AgentRunRequest, runtime: {
    executablePath: string
    envVarName: string
    apiKey?: string
  }): RunnerCommand
  normalizeStdout(text: string, runId: string): AgentEvent[]
  normalizeStderr(text: string, runId: string): AgentEvent[]
}
