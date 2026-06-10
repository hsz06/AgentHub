import { execFile } from 'child_process'
import path from 'path'
import { promisify } from 'util'
import prisma from '../utils/prisma'
import { decryptSecret, encryptSecret } from '../utils/crypto'

const execFileAsync = promisify(execFile)

export type CliRuntimeType = 'claude-code' | 'codex' | 'opencode'

interface RuntimeDefaults {
  displayName: string
  executablePath: string
  executableEnv: string
  envVarName: string
  permissionProfile: string
  legacyDockerImage: string
  legacyCommandTemplate: string
}

export const CLI_RUNTIME_DEFAULTS: Record<CliRuntimeType, RuntimeDefaults> = {
  'claude-code': {
    displayName: 'Claude Code CLI',
    executablePath: 'claude',
    executableEnv: 'CLAUDE_CODE_BIN',
    envVarName: 'CLAUDE_CODE_API_KEY',
    permissionProfile: 'safe_write',
    legacyDockerImage: 'agenthub-cli-claude-code:latest',
    legacyCommandTemplate: 'claude -p <task> --output-format stream-json'
  },
  codex: {
    displayName: 'Codex CLI',
    executablePath: 'codex',
    executableEnv: 'CODEX_BIN',
    envVarName: 'CODEX_CLI_API_KEY',
    permissionProfile: 'safe_write',
    legacyDockerImage: 'agenthub-cli-codex:latest',
    legacyCommandTemplate: 'codex exec --json --sandbox <profile> <task>'
  },
  opencode: {
    displayName: 'OpenCode CLI',
    executablePath: 'opencode',
    executableEnv: 'OPENCODE_BIN',
    envVarName: 'OPENCODE_API_KEY',
    permissionProfile: 'safe_write',
    legacyDockerImage: 'agenthub-cli-opencode:latest',
    legacyCommandTemplate: 'opencode run <task>'
  }
}

export function isCliRuntimeType(value: string): value is CliRuntimeType {
  return value === 'claude-code' || value === 'codex' || value === 'opencode'
}

export async function listCliRuntimeConfigs(userId: string) {
  const configs = await prisma.cliRuntimeConfig.findMany({ where: { userId } })
  return Object.entries(CLI_RUNTIME_DEFAULTS).map(([runtimeType, defaults]) => {
    const config = configs.find(item => item.runtimeType === runtimeType)
    return {
      runtimeType,
      displayName: config?.displayName || defaults.displayName,
      executablePath: resolveExecutablePath(config?.executablePath, defaults),
      envVarName: config?.envVarName || defaults.envVarName,
      permissionProfile: readPermissionProfile(config?.commandTemplate, defaults.permissionProfile),
      enabled: Boolean(config?.enabled),
      configured: Boolean(config?.encryptedApiKey || process.env[config?.envVarName || defaults.envVarName]),
      localExecution: true
    }
  })
}

export async function saveCliRuntimeConfig(userId: string, runtimeType: CliRuntimeType, data: {
  displayName?: string
  executablePath?: string
  enabled?: boolean
  apiKey?: string
  envVarName?: string
  permissionProfile?: string
}) {
  const defaults = CLI_RUNTIME_DEFAULTS[runtimeType]
  const previous = await prisma.cliRuntimeConfig.findUnique({ where: { userId_runtimeType: { userId, runtimeType } } })
  const apiKey = typeof data.apiKey === 'string' ? data.apiKey.trim() : ''
  const permission = normalizePermission(data.permissionProfile || readPermissionProfile(previous?.commandTemplate, defaults.permissionProfile))
  const config = await prisma.cliRuntimeConfig.upsert({
    where: { userId_runtimeType: { userId, runtimeType } },
    update: {
      displayName: data.displayName || defaults.displayName,
      executablePath: data.executablePath?.trim() || previous?.executablePath || null,
      envVarName: data.envVarName || defaults.envVarName,
      commandTemplate: legacyTemplate(defaults, permission),
      enabled: typeof data.enabled === 'boolean' ? data.enabled : previous?.enabled || false,
      ...(apiKey && { encryptedApiKey: JSON.stringify(encryptSecret(apiKey)) })
    },
    create: {
      userId,
      runtimeType,
      displayName: data.displayName || defaults.displayName,
      executablePath: data.executablePath?.trim() || null,
      dockerImage: defaults.legacyDockerImage,
      commandTemplate: legacyTemplate(defaults, permission),
      envVarName: data.envVarName || defaults.envVarName,
      enabled: Boolean(data.enabled),
      encryptedApiKey: apiKey ? JSON.stringify(encryptSecret(apiKey)) : null
    }
  })
  return redactedConfig(config, defaults)
}

export async function getCliRuntimeConfig(userId: string, runtimeType: CliRuntimeType) {
  const defaults = CLI_RUNTIME_DEFAULTS[runtimeType]
  const config = await prisma.cliRuntimeConfig.findUnique({ where: { userId_runtimeType: { userId, runtimeType } } })
  const encrypted = config?.encryptedApiKey ? JSON.parse(config.encryptedApiKey) : null
  const envName = config?.envVarName || defaults.envVarName
  return {
    runtimeType,
    displayName: config?.displayName || defaults.displayName,
    executablePath: resolveExecutablePath(config?.executablePath, defaults),
    envVarName: envName,
    permissionProfile: readPermissionProfile(config?.commandTemplate, defaults.permissionProfile),
    enabled: Boolean(config?.enabled),
    apiKey: encrypted ? decryptSecret(encrypted) : process.env[envName]
  }
}

export async function testCliRuntime(userId: string, runtimeType: CliRuntimeType) {
  ensureLocalExecutionEnabled()
  const config = await getCliRuntimeConfig(userId, runtimeType)
  if (!config.enabled) throw new Error('CLI runtime is disabled')
  const result = await execFileAsync(config.executablePath, ['--version'], {
    env: localProcessEnv(config.executablePath),
    timeout: 30000
  })
  return result.stdout.trim() || result.stderr.trim() || 'agenthub-cli-runtime-ok'
}

export function ensureLocalExecutionEnabled() {
  if (process.env.LOCAL_EXECUTION_ENABLED !== 'true') throw new Error('Local execution is disabled')
}

export function localProcessEnv(executablePath?: string, extra: NodeJS.ProcessEnv = {}) {
  const executableDir = executablePath && executablePath.includes(path.sep) ? path.dirname(executablePath) : ''
  return {
    HOME: process.env.HOME,
    USER: process.env.USER,
    LANG: process.env.LANG || 'C.UTF-8',
    PATH: [executableDir, process.env.LOCAL_EXECUTION_PATH, process.env.PATH].filter(Boolean).join(path.delimiter),
    ...extra
  }
}

function resolveExecutablePath(configured: string | null | undefined, defaults: RuntimeDefaults) {
  return configured || process.env[defaults.executableEnv] || defaults.executablePath
}

function redactedConfig(config: {
  runtimeType: string
  displayName: string
  executablePath: string | null
  commandTemplate: string
  envVarName: string
  enabled: boolean
  encryptedApiKey: string | null
}, defaults: RuntimeDefaults) {
  return {
    runtimeType: config.runtimeType,
    displayName: config.displayName,
    executablePath: resolveExecutablePath(config.executablePath, defaults),
    envVarName: config.envVarName,
    permissionProfile: readPermissionProfile(config.commandTemplate, 'safe_write'),
    enabled: config.enabled,
    configured: Boolean(config.encryptedApiKey || process.env[config.envVarName || defaults.envVarName]),
    localExecution: true
  }
}

function normalizePermission(value: string) {
  return value === 'readonly' ? 'readonly' : 'safe_write'
}

function readPermissionProfile(commandTemplate: string | null | undefined, fallback: string) {
  const match = /#\s*agenthub:permission=([a-z_]+)/.exec(commandTemplate || '')
  return normalizePermission(match?.[1] || fallback)
}

function legacyTemplate(defaults: RuntimeDefaults, permission: string) {
  return `${defaults.legacyCommandTemplate} # agenthub:permission=${permission}`
}
