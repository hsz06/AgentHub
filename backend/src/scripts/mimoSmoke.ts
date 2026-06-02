import dotenv from 'dotenv'
import prisma from '../utils/prisma'
import { getProviderRuntimeConfig } from '../controllers/SettingsController'
import { OpenAIAgent } from '../services/agents/OpenAIAgent'
import { AgentManager } from '../services/agents/AgentManager'
import { attachGeneratedArtifacts } from '../services/ArtifactExtractionService'

dotenv.config()

const provider = 'mimo'
const model = process.env.MIMO_MODEL || 'mimo-v2.5-pro'

async function main() {
  if (!process.env.MIMO_API_KEY) {
    console.error([
      'MIMO_API_KEY is not set. No network request was sent.',
      'PowerShell safe prompt:',
      '$secure = Read-Host "MiMo API Key" -AsSecureString',
      '$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)',
      '$env:MIMO_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)',
      'npm run smoke:mimo',
      'Remove-Item Env:\\MIMO_API_KEY'
    ].join('\n'))
    process.exitCode = 2
    return
  }

  const user = await prisma.user.findUnique({ where: { email: 'demo@agenthub.local' } })
  if (!user) throw new Error('Demo user not found. Run `npm run prisma:seed` first.')
  const agent = await prisma.agent.findUnique({ where: { id: 'agent-mimo-builtin' } })
  if (!agent) throw new Error('MiMo builtin Agent not found. Run `npm run prisma:seed` first.')
  const workspace = await prisma.workspace.findUnique({ where: { id: 'workspace-demo' } })
  if (!workspace) throw new Error('Demo workspace not found. Run `npm run prisma:seed` first.')

  try {
    const runtimeConfig = await getProviderRuntimeConfig(user.id, provider)
    const direct = new OpenAIAgent(runtimeConfig.apiKey!, runtimeConfig.baseURL, runtimeConfig.model)
    const ok = await direct.normalChat([{ role: 'user', content: 'Output exactly: OK' }], { maxTokens: 256, temperature: 0 })
    const okText = ok.trim()
    console.log(`provider-test: ${okText.slice(0, 40)}`)
    if (!okText) throw new Error('Provider test returned empty assistant content.')

    let chunks = 0
    const runtime = await AgentManager.getInstance().createRuntimeAgent(agent, user.id)
    const streamed = await runtime.streamChat([
      { role: 'system', content: 'You are running an AgentHub smoke test. Keep responses concise.' },
      { role: 'user', content: 'Say hello from MiMo in one short sentence.' }
    ], () => { chunks += 1 }, { model, maxTokens: 160, temperature: 0.2 })
    console.log(`stream-test: chunks=${chunks}, text="${streamed.trim().replace(/\s+/g, ' ').slice(0, 120)}"`)
    if (!streamed.trim() || chunks < 1) throw new Error('Stream test returned no assistant content.')

    const toolText = await runtime.normalChat([{
      role: 'user',
      content: [
        'Return exactly one fenced agenthub-tool JSON block and nothing else.',
        'The block must propose a file change for this workspace.',
        `workspaceId: ${workspace.id}`,
        'filePath: smoke/mimo-live-test.txt',
        'content: MiMo live integration passed.'
      ].join('\n')
    }], { model, maxTokens: 900, temperature: 0 })
    console.log(`tool-output-preview: "${toolText.trim().replace(/\s+/g, ' ').slice(0, 180)}"`)
    const conversation = await prisma.conversation.findFirst({ where: { id: 'conversation-demo', userId: user.id } })
    if (!conversation) throw new Error('Demo conversation not found.')
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'agent',
        senderId: agent.id,
        agentId: agent.id,
        content: toolText,
        messageType: 'text',
        status: 'completed'
      }
    })
    const before = await prisma.toolApproval.count({ where: { userId: user.id, title: { contains: 'smoke/mimo-live-test.txt' } } })
    await attachGeneratedArtifacts(user.id, message.id, toolText, {
      conversationId: conversation.id,
      agentId: agent.id,
      allowedTools: ['propose_file_change']
    })
    const after = await prisma.toolApproval.count({ where: { userId: user.id, title: { contains: 'smoke/mimo-live-test.txt' } } })
    const approvalsCreated = Math.max(0, after - before)
    console.log(`tool-proposal-test: approvals-created=${approvalsCreated}`)
    if (approvalsCreated < 1) throw new Error('Tool proposal test did not create an approval.')

    if (process.env.SMOKE_KEEP_RECORDS !== 'true') {
      await prisma.toolApproval.deleteMany({ where: { userId: user.id, title: { contains: 'smoke/mimo-live-test.txt' } } })
      await prisma.message.deleteMany({ where: { id: message.id } })
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(async error => {
  console.error(`mimo-smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  await prisma.$disconnect()
  process.exitCode = 1
})
