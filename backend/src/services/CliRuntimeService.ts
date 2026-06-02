import { execFile } from 'child_process'
import { promisify } from 'util'
import prisma from '../utils/prisma'
import { decryptSecret, encryptSecret } from '../utils/crypto'

const execFileAsync = promisify(execFile)

export type CliRuntimeType = 'claude-code' | 'codex' | 'opencode'

export const CLI_RUNTIME_DEFAULTS: Record<CliRuntimeType, { displayName: string; dockerImage: string; commandTemplate: string; envVarName: string; permissionProfile: string }> = {
  'claude-code': {
    displayName: 'Claude Code CLI',
    dockerImage: 'agenthub-cli-claude-code:latest',
    commandTemplate: 'claude --bare -p "$(cat {{promptFile}})" --output-format stream-json --max-turns {{maxTurns}}',
    envVarName: 'CLAUDE_CODE_API_KEY',
    permissionProfile: 'safe_write'
  },
  codex: {
    displayName: 'Codex CLI',
    dockerImage: 'agenthub-cli-codex:latest',
    commandTemplate: 'codex exec --cd /workspace --json --sandbox {{sandbox}} "$(cat {{promptFile}})"',
    envVarName: 'CODEX_CLI_API_KEY',
    permissionProfile: 'safe_write'
  },
  opencode: {
    displayName: 'OpenCode CLI',
    dockerImage: 'agenthub-cli-opencode:latest',
    commandTemplate: 'opencode run "$(cat /workspace/.agenthub/prompt.txt)"',
    envVarName: 'OPENCODE_API_KEY',
    permissionProfile: 'safe_write'
  }
}

export function isCliRuntimeType(value: string): value is CliRuntimeType {
  return value === 'claude-code' || value === 'codex' || value === 'opencode'
}

export async function listCliRuntimeConfigs(userId: string) {
  const configs = await prisma.cliRuntimeConfig.findMany({ where: { userId } })
  return Object.entries(CLI_RUNTIME_DEFAULTS).map(([runtimeType, defaults]) => {
    const config = configs.find(item => item.runtimeType === runtimeType)
    const envKey = process.env[`${runtimeType.toUpperCase().replace(/-/g, '_')}_API_KEY`]
    return {
      runtimeType,
      displayName: config?.displayName || defaults.displayName,
      dockerImage: config?.dockerImage || defaults.dockerImage,
      commandTemplate: config?.commandTemplate || defaults.commandTemplate,
      envVarName: config?.envVarName || defaults.envVarName,
      permissionProfile: getPermissionProfile(config?.commandTemplate, defaults.permissionProfile),
      enabled: Boolean(config?.enabled),
      configured: Boolean(config?.encryptedApiKey || envKey)
    }
  })
}

export async function saveCliRuntimeConfig(userId: string, runtimeType: CliRuntimeType, data: {
  displayName?: string
  dockerImage?: string
  commandTemplate?: string
  enabled?: boolean
  apiKey?: string
  envVarName?: string
  permissionProfile?: string
}) {
  const defaults = CLI_RUNTIME_DEFAULTS[runtimeType]
  const previous = await prisma.cliRuntimeConfig.findUnique({ where: { userId_runtimeType: { userId, runtimeType } } })
  const apiKey = typeof data.apiKey === 'string' ? data.apiKey.trim() : ''
  const config = await prisma.cliRuntimeConfig.upsert({
    where: { userId_runtimeType: { userId, runtimeType } },
    update: {
      displayName: data.displayName || defaults.displayName,
      dockerImage: data.dockerImage || defaults.dockerImage,
      commandTemplate: withPermissionProfile(data.commandTemplate || defaults.commandTemplate, data.permissionProfile || getPermissionProfile(previous?.commandTemplate, defaults.permissionProfile)),
      envVarName: data.envVarName || defaults.envVarName,
      enabled: typeof data.enabled === 'boolean' ? data.enabled : previous?.enabled || false,
      ...(apiKey && { encryptedApiKey: JSON.stringify(encryptSecret(apiKey)) })
    },
    create: {
      userId,
      runtimeType,
      displayName: data.displayName || defaults.displayName,
      dockerImage: data.dockerImage || defaults.dockerImage,
      commandTemplate: withPermissionProfile(data.commandTemplate || defaults.commandTemplate, data.permissionProfile || defaults.permissionProfile),
      envVarName: data.envVarName || defaults.envVarName,
      enabled: Boolean(data.enabled),
      encryptedApiKey: apiKey ? JSON.stringify(encryptSecret(apiKey)) : null
    }
  })
  return redactedConfig(config)
}

export async function getCliRuntimeConfig(userId: string, runtimeType: CliRuntimeType) {
  const defaults = CLI_RUNTIME_DEFAULTS[runtimeType]
  const config = await prisma.cliRuntimeConfig.findUnique({ where: { userId_runtimeType: { userId, runtimeType } } })
  const encrypted = config?.encryptedApiKey ? JSON.parse(config.encryptedApiKey) : null
  const envName = config?.envVarName || defaults.envVarName
  return {
    runtimeType,
    displayName: config?.displayName || defaults.displayName,
    dockerImage: config?.dockerImage || defaults.dockerImage,
    commandTemplate: config?.commandTemplate || defaults.commandTemplate,
    envVarName: envName,
    permissionProfile: getPermissionProfile(config?.commandTemplate, defaults.permissionProfile),
    enabled: Boolean(config?.enabled),
    apiKey: encrypted ? decryptSecret(encrypted) : process.env[envName]
  }
}

export async function testCliRuntime(userId: string, runtimeType: CliRuntimeType) {
  const config = await getCliRuntimeConfig(userId, runtimeType)
  if (!config.enabled) throw new Error('CLI runtime is disabled')
  if (!config.apiKey) throw new Error('CLI runtime API key is not configured')
  if (process.env.SANDBOX_EXECUTION_ENABLED !== 'true') throw new Error('Docker sandbox execution is disabled')
  const result = await execFileAsync('docker', [
    'run', '--rm', '--cpus', '0.5', '--memory', '256m', '--pids-limit', '64',
    '--security-opt', 'no-new-privileges',
    '-e', `${config.envVarName}=${config.apiKey}`,
    config.dockerImage,
    'sh', '-lc', `${config.commandTemplate.split(/\s+/)[0]} --version >/dev/null 2>&1 || command -v ${config.commandTemplate.split(/\s+/)[0]} >/dev/null`
  ], { timeout: 30000 })
  return result.stdout.trim() || 'agenthub-cli-runtime-ok'
}

export function renderCommand(commandTemplate: string) {
  return commandTemplate
}

function redactedConfig(config: {
  runtimeType: string
  displayName: string
  dockerImage: string
  commandTemplate: string
  envVarName: string
  enabled: boolean
  encryptedApiKey: string | null
}) {
  return {
    runtimeType: config.runtimeType,
    displayName: config.displayName,
    dockerImage: config.dockerImage,
    commandTemplate: config.commandTemplate,
    envVarName: config.envVarName,
    permissionProfile: getPermissionProfile(config.commandTemplate, 'safe_write'),
    enabled: config.enabled,
    configured: Boolean(config.encryptedApiKey)
  }
}

function getPermissionProfile(commandTemplate: string | null | undefined, fallback: string) {
  const match = /#\s*agenthub:permission=([a-z_]+)/.exec(commandTemplate || '')
  return match?.[1] || fallback
}

function withPermissionProfile(commandTemplate: string, profile: string) {
  const cleaned = commandTemplate.replace(/\s*#\s*agenthub:permission=[a-z_]+/g, '')
  return `${cleaned} # agenthub:permission=${profile}`
}
