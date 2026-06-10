import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import prisma from '../utils/prisma'

dotenv.config()

type Check = {
  label: string
  run: () => Promise<void>
}

async function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'demo@agenthub.local' } })
  const workspace = await prisma.workspace.findUnique({ where: { id: 'workspace-demo' } })
  const conversation = await prisma.conversation.findUnique({
    where: { id: 'conversation-demo' },
    include: { members: { include: { agent: true } } }
  })
  const workspaceRoot = workspace?.rootPath ? path.resolve(workspace.rootPath) : ''

  const checks: Check[] = [
    {
      label: 'demo-account',
      run: async () => {
        await assert(user?.id === 'user-demo', 'Demo user is missing. Run `npm run prisma:seed`.')
      }
    },
    {
      label: 'builtin-agents',
      run: async () => {
        const agents = await prisma.agent.findMany({ where: { isBuiltin: true } })
        const adapterTypes = new Set(agents.map(agent => agent.adapterType))
        for (const required of ['openai', 'claude', 'mimo', 'claude-code-cli', 'codex-cli', 'opencode-cli']) {
          await assert(adapterTypes.has(required), `Missing builtin Agent adapter: ${required}`)
        }
      }
    },
    {
      label: 'demo-conversation',
      run: async () => {
        await assert(conversation?.userId === user?.id, 'Demo conversation is missing or not owned by demo user.')
        await assert(conversation?.type === 'group', 'Demo conversation must be a group conversation.')
        await assert((conversation?.members.length || 0) >= 3, 'Demo group should include at least three Agents.')
      }
    },
    {
      label: 'workspace-binding',
      run: async () => {
        await assert(workspace?.userId === user?.id, 'Demo workspace is missing or not owned by demo user.')
        await assert(workspace?.conversationId === conversation?.id, 'Demo workspace is not bound to the demo conversation.')
      }
    },
    {
      label: 'workspace-start-script',
      run: async () => {
        const packageJson = await readJson(path.join(workspaceRoot, 'package.json'))
        const scripts = packageJson.scripts as Record<string, string> | undefined
        await assert(scripts?.start === 'node server.js', 'Demo workspace must include scripts.start = "node server.js".')
      }
    },
    {
      label: 'workspace-files',
      run: async () => {
        for (const relativePath of ['server.js', 'public/index.html', 'public/styles.css', 'public/app.js', 'README.md']) {
          const stat = await fs.stat(path.join(workspaceRoot, relativePath))
          await assert(stat.isFile() && stat.size > 0, `Demo workspace file is missing or empty: ${relativePath}`)
        }
      }
    },
    {
      label: 'workspace-revisions',
      run: async () => {
        const revisions = await prisma.workspaceFileRevision.count({ where: { workspaceId: workspace?.id } })
        await assert(revisions >= 5, 'Demo workspace file revisions were not seeded.')
      }
    },
    {
      label: 'artifacts',
      run: async () => {
        const artifacts = await prisma.artifact.findMany({
          where: { userId: user?.id, workspaceId: workspace?.id },
          include: { versions: true }
        })
        const types = new Set(artifacts.map(artifact => artifact.type))
        for (const type of ['web', 'document', 'slides']) {
          await assert(types.has(type), `Missing seeded ${type} artifact.`)
        }
        await assert(artifacts.every(artifact => artifact.versions.length > 0), 'Every seeded artifact must have at least one version.')
      }
    },
    {
      label: 'inline-artifact-message',
      run: async () => {
        const message = await prisma.message.findUnique({ where: { id: 'message-demo-artifacts' } })
        await assert(message?.conversationId === conversation?.id, 'Demo artifact message is missing from the demo conversation.')
        if (!message) throw new Error('Demo artifact message is missing from the demo conversation.')
        const metadata = JSON.parse(message.metadata || '{}') as { preview_cards?: Array<{ type?: string; data?: { artifactId?: string } }> }
        const cardTypes = new Set((metadata.preview_cards || []).map(card => card.type))
        for (const type of ['web-preview', 'file-attachment', 'slides']) {
          await assert(cardTypes.has(type), `Demo artifact message is missing ${type} preview card.`)
        }
        await assert((metadata.preview_cards || []).every(card => card.data?.artifactId), 'Every demo preview card must reference an artifact.')
      }
    },
    {
      label: 'orchestration-demo',
      run: async () => {
        const run = await prisma.orchestrationRun.findUnique({
          where: { id: 'orchestration-demo-run' },
          include: { tasks: true }
        })
        await assert(run?.conversationId === conversation?.id, 'Demo orchestration run is missing from the demo conversation.')
        if (!run) throw new Error('Demo orchestration run is missing from the demo conversation.')
        await assert(run.status === 'completed', 'Demo orchestration run must be completed.')
        await assert(run.tasks.length >= 3, 'Demo orchestration run should contain at least three Agent tasks.')
        await assert(run.tasks.every(task => task.status === 'completed'), 'Every seeded orchestration task must be completed.')
        await assert(new Set(run.tasks.map(task => task.agentId)).size >= 3, 'Demo orchestration should involve at least three Agents.')
      }
    },
    {
      label: 'deployment-ready',
      run: async () => {
        const html = await fs.readFile(path.join(workspaceRoot, 'public/index.html'), 'utf8')
        await assert(html.includes('AgentHub Demo Workspace'), 'Demo HTML page content is not ready for preview.')
        await assert(Boolean(process.env.WORKSPACE_ROOT || workspaceRoot.includes(path.join('data', 'workspaces'))), 'Workspace root is not configured for local deployment.')
      }
    }
  ]

  for (const check of checks) {
    await check.run()
    console.log(`${check.label}: ok`)
  }

  await prisma.$disconnect()
}

main().catch(async error => {
  console.error(`demo-smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  await prisma.$disconnect()
  process.exitCode = 1
})
