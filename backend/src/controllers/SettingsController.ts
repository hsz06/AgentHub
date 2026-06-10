import { Response } from 'express'
import prisma from '../utils/prisma'
import { AuthenticatedRequest } from '../middleware/auth'
import { decryptSecret, encryptSecret } from '../utils/crypto'
import { OpenAIAgent } from '../services/agents/OpenAIAgent'
import { ClaudeAgent } from '../services/agents/ClaudeAgent'
import { isCliRuntimeType, listCliRuntimeConfigs, saveCliRuntimeConfig, testCliRuntime } from '../services/CliRuntimeService'

export type Provider = 'openai' | 'anthropic' | 'mimo'

const PROVIDER_DEFAULTS: Record<Provider, { displayName: string; baseURL?: string; defaultModel: string }> = {
  openai: { displayName: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  anthropic: { displayName: 'Anthropic', defaultModel: 'claude-3-5-sonnet-latest' },
  mimo: { displayName: 'MiMo', baseURL: 'https://token-plan-cn.xiaomimimo.com/v1', defaultModel: 'mimo-v2.5-pro' }
}

const ENV_PROVIDER_KEYS: Record<Provider, { apiKey: string; baseURL?: string; model?: string }> = {
  openai: { apiKey: 'OPENAI_API_KEY', baseURL: 'OPENAI_BASE_URL', model: 'OPENAI_MODEL' },
  anthropic: { apiKey: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL' },
  mimo: { apiKey: 'MIMO_API_KEY', baseURL: 'MIMO_BASE_URL', model: 'MIMO_MODEL' }
}

function isProvider(value: string): value is Provider {
  return value === 'openai' || value === 'anthropic' || value === 'mimo'
}

async function readLegacyKeys(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { encryptedApiKeys: true } })
  if (!user) throw new Error('User not found')
  return JSON.parse(user.encryptedApiKeys || '{}') as Record<string, ReturnType<typeof encryptSecret>>
}

export async function listProviders(req: AuthenticatedRequest, res: Response) {
  const [configs, legacy] = await Promise.all([
    prisma.providerConfig.findMany({ where: { userId: req.userId! } }),
    readLegacyKeys(req.userId!)
  ])
  res.json(Object.entries(PROVIDER_DEFAULTS).map(([type, defaults]) => {
    const config = configs.find(item => item.providerType === type)
    return {
      providerType: type,
      displayName: config?.displayName || defaults.displayName,
      baseURL: config?.baseURL || process.env[ENV_PROVIDER_KEYS[type as Provider].baseURL || ''] || defaults.baseURL || null,
      defaultModel: config?.defaultModel || process.env[ENV_PROVIDER_KEYS[type as Provider].model || ''] || defaults.defaultModel,
      configured: Boolean(config?.encryptedApiKey || legacy[type] || process.env[ENV_PROVIDER_KEYS[type as Provider].apiKey])
    }
  }))
}

export async function setProviderConfig(req: AuthenticatedRequest, res: Response) {
  const provider = String(req.params.provider)
  if (!isProvider(provider)) return res.status(400).json({ error: 'Invalid provider' })
  const defaults = PROVIDER_DEFAULTS[provider]
  const apiKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : ''
  const [previous, legacy] = await Promise.all([
    prisma.providerConfig.findUnique({ where: { userId_providerType: { userId: req.userId!, providerType: provider } } }),
    readLegacyKeys(req.userId!)
  ])
  const hasExistingKey = Boolean(previous?.encryptedApiKey || legacy[provider] || process.env[ENV_PROVIDER_KEYS[provider].apiKey])
  if (!apiKey && !hasExistingKey) return res.status(400).json({ error: 'apiKey is required for first configuration' })
  const config = await prisma.providerConfig.upsert({
    where: { userId_providerType: { userId: req.userId!, providerType: provider } },
    update: {
      displayName: req.body.displayName || defaults.displayName,
      baseURL: req.body.baseURL ?? defaults.baseURL ?? null,
      defaultModel: req.body.defaultModel || defaults.defaultModel,
      ...(apiKey && { encryptedApiKey: JSON.stringify(encryptSecret(apiKey)) })
    },
    create: {
      userId: req.userId!,
      providerType: provider,
      displayName: req.body.displayName || defaults.displayName,
      baseURL: req.body.baseURL ?? defaults.baseURL ?? null,
      defaultModel: req.body.defaultModel || defaults.defaultModel,
      encryptedApiKey: apiKey ? JSON.stringify(encryptSecret(apiKey)) : null
    }
  })
  res.json({
    providerType: config.providerType,
    displayName: config.displayName,
    baseURL: config.baseURL,
    defaultModel: config.defaultModel,
    configured: Boolean(config.encryptedApiKey || legacy[provider] || process.env[ENV_PROVIDER_KEYS[provider].apiKey])
  })
}

export async function deleteProviderKey(req: AuthenticatedRequest, res: Response) {
  const provider = String(req.params.provider)
  if (!isProvider(provider)) return res.status(400).json({ error: 'Invalid provider' })
  await prisma.providerConfig.updateMany({ where: { userId: req.userId!, providerType: provider }, data: { encryptedApiKey: null } })
  const legacy = await readLegacyKeys(req.userId!)
  delete legacy[provider]
  await prisma.user.update({ where: { id: req.userId! }, data: { encryptedApiKeys: JSON.stringify(legacy) } })
  res.status(204).send()
}

export async function getProviderRuntimeConfig(userId: string, provider: Provider) {
  const defaults = PROVIDER_DEFAULTS[provider]
  const config = await prisma.providerConfig.findUnique({ where: { userId_providerType: { userId, providerType: provider } } })
  const legacy = await readLegacyKeys(userId)
  const encrypted = config?.encryptedApiKey ? JSON.parse(config.encryptedApiKey) : legacy[provider]
  const env = ENV_PROVIDER_KEYS[provider]
  return {
    provider,
    baseURL: config?.baseURL || (env.baseURL ? process.env[env.baseURL] : undefined) || defaults.baseURL,
    model: config?.defaultModel || (env.model ? process.env[env.model] : undefined) || defaults.defaultModel,
    apiKey: encrypted ? decryptSecret(encrypted) : process.env[env.apiKey]
  }
}

export async function testProvider(req: AuthenticatedRequest, res: Response) {
  const provider = String(req.params.provider)
  if (!isProvider(provider)) return res.status(400).json({ error: 'Invalid provider' })
  try {
    const config = await getProviderRuntimeConfig(req.userId!, provider)
    if (!config.apiKey) return res.status(400).json({ error: 'Configure an API key before testing this provider' })
    const runtime = provider === 'anthropic'
      ? new ClaudeAgent(config.apiKey, config.model)
      : new OpenAIAgent(config.apiKey, config.baseURL, config.model)
    await runtime.normalChat([{ role: 'user', content: 'Reply with OK only.' }], { maxTokens: 8, temperature: 0 })
    res.json({ providerType: provider, ok: true, model: config.model })
  } catch {
    res.status(502).json({ error: 'Provider connection test failed. Check endpoint, model, and credentials.' })
  }
}

export async function listCliRuntimes(req: AuthenticatedRequest, res: Response) {
  res.json(await listCliRuntimeConfigs(req.userId!))
}

export async function setCliRuntime(req: AuthenticatedRequest, res: Response) {
  const runtimeType = String(req.params.runtimeType)
  if (!isCliRuntimeType(runtimeType)) return res.status(400).json({ error: 'Invalid CLI runtime' })
  const config = await saveCliRuntimeConfig(req.userId!, runtimeType, req.body || {})
  res.json(config)
}

export async function testCliRuntimeConfig(req: AuthenticatedRequest, res: Response) {
  const runtimeType = String(req.params.runtimeType)
  if (!isCliRuntimeType(runtimeType)) return res.status(400).json({ error: 'Invalid CLI runtime' })
  try {
    const output = await testCliRuntime(req.userId!, runtimeType)
    res.json({ ok: true, output })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'CLI runtime test failed' })
  }
}
