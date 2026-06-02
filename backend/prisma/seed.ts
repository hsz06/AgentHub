/// <reference path="../src/types/bcryptjs.d.ts" />

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@agenthub.local' },
    update: {},
    create: {
      id: 'user-demo',
      name: 'Demo User',
      email: 'demo@agenthub.local',
      passwordHash: await bcrypt.hash('AgentHub123!', 12)
    }
  })
  const gptAgent = await prisma.agent.upsert({
    where: { id: 'agent-gpt-builtin' },
    update: { model: 'gpt-4o-mini', tools: JSON.stringify(['read_workspace_file', 'propose_file_change', 'propose_deployment']) },
    create: {
      id: 'agent-gpt-builtin',
      name: 'Codex',
      description: 'OpenAI coding and product implementation Agent',
      capabilities: JSON.stringify(['Code generation', 'Debugging', 'Web artifacts']),
      systemPrompt: 'You are Codex. Produce practical engineering output and propose workspace changes for approval.',
      adapterType: 'openai',
      model: 'gpt-4o-mini',
      tools: JSON.stringify(['read_workspace_file', 'propose_file_change', 'propose_deployment']),
      isBuiltin: true
    }
  })
  const claudeAgent = await prisma.agent.upsert({
    where: { id: 'agent-claude-builtin' },
    update: { model: 'claude-3-5-sonnet-latest', tools: JSON.stringify(['read_workspace_file', 'propose_file_change']) },
    create: {
      id: 'agent-claude-builtin',
      name: 'Claude',
      description: 'Anthropic analysis and review Agent',
      capabilities: JSON.stringify(['Analysis', 'Review', 'Document artifacts']),
      systemPrompt: 'You are Claude. Analyze requirements, review results, and write clear deliverables.',
      adapterType: 'claude',
      model: 'claude-3-5-sonnet-latest',
      tools: JSON.stringify(['read_workspace_file', 'propose_file_change']),
      isBuiltin: true
    }
  })
  const mimoAgent = await prisma.agent.upsert({
    where: { id: 'agent-mimo-builtin' },
    update: { model: 'mimo-v2.5-pro', tools: JSON.stringify(['read_workspace_file', 'propose_file_change', 'propose_command', 'propose_deployment']) },
    create: {
      id: 'agent-mimo-builtin',
      name: 'MiMo',
      description: 'MiMo OpenAI-compatible implementation Agent',
      capabilities: JSON.stringify(['Streaming chat', 'Workspace changes', 'Deployment planning']),
      systemPrompt: 'You are MiMo, an implementation assistant inside AgentHub. Use managed tools and request approval before writes or execution.',
      adapterType: 'mimo',
      model: 'mimo-v2.5-pro',
      tools: JSON.stringify(['read_workspace_file', 'propose_file_change', 'propose_command', 'propose_deployment']),
      isBuiltin: true
    }
  })
  await prisma.agent.upsert({
    where: { id: 'agent-claude-code-cli-builtin' },
    update: { adapterType: 'claude-code-cli', tools: JSON.stringify(['propose_file_change']) },
    create: {
      id: 'agent-claude-code-cli-builtin',
      name: 'Claude Code CLI',
      description: 'External Claude Code CLI runtime executed in the AgentHub worker sandbox',
      capabilities: JSON.stringify(['External CLI', 'Repository edits via approval']),
      systemPrompt: 'Run Claude Code CLI against the managed workspace copy and return proposed changes for approval.',
      adapterType: 'claude-code-cli',
      model: 'cli-configured',
      tools: JSON.stringify(['propose_file_change']),
      isBuiltin: true
    }
  })
  await prisma.agent.upsert({
    where: { id: 'agent-codex-cli-builtin' },
    update: { adapterType: 'codex-cli', tools: JSON.stringify(['propose_file_change']) },
    create: {
      id: 'agent-codex-cli-builtin',
      name: 'Codex CLI',
      description: 'External Codex CLI runtime executed in the AgentHub worker sandbox',
      capabilities: JSON.stringify(['External CLI', 'Repository edits via approval']),
      systemPrompt: 'Run Codex CLI against the managed workspace copy and return proposed changes for approval.',
      adapterType: 'codex-cli',
      model: 'cli-configured',
      tools: JSON.stringify(['propose_file_change']),
      isBuiltin: true
    }
  })
  await prisma.agent.upsert({
    where: { id: 'agent-opencode-cli-builtin' },
    update: { adapterType: 'opencode-cli', tools: JSON.stringify(['propose_file_change']) },
    create: {
      id: 'agent-opencode-cli-builtin',
      name: 'OpenCode CLI',
      description: 'External OpenCode CLI runtime executed in the AgentHub worker sandbox',
      capabilities: JSON.stringify(['External CLI', 'Repository edits via approval']),
      systemPrompt: 'Run OpenCode CLI against the managed workspace copy and return proposed changes for approval.',
      adapterType: 'opencode-cli',
      model: 'cli-configured',
      tools: JSON.stringify(['propose_file_change']),
      isBuiltin: true
    }
  })
  const conversation = await prisma.conversation.upsert({
    where: { id: 'conversation-demo' },
    update: {},
    create: {
      id: 'conversation-demo',
      title: 'AgentHub Demo Collaboration',
      type: 'group',
      userId: demoUser.id,
      members: { create: [{ agentId: gptAgent.id }, { agentId: claudeAgent.id }, { agentId: mimoAgent.id }] }
    }
  })
  const workspace = await prisma.workspace.upsert({
    where: { id: 'workspace-demo' },
    update: {},
    create: {
      id: 'workspace-demo',
      name: 'Landing Page Demo',
      rootPath: 'data/workspaces/user-demo/workspace-demo',
      userId: demoUser.id,
      conversationId: conversation.id
    }
  })
  await prisma.artifact.upsert({
    where: { id: 'artifact-demo-page' },
    update: {},
    create: {
      id: 'artifact-demo-page',
      name: 'welcome.html',
      type: 'web',
      mimeType: 'text/html',
      userId: demoUser.id,
      workspaceId: workspace.id,
      versions: {
        create: { version: 1, createdBy: demoUser.id, content: '<main><h1>AgentHub</h1><p>Secure multi-agent collaboration workspace.</p></main>' }
      }
    }
  })
  await prisma.artifact.upsert({
    where: { id: 'artifact-demo-document' },
    update: {},
    create: {
      id: 'artifact-demo-document',
      name: 'demo-notes.md',
      type: 'document',
      mimeType: 'text/markdown',
      userId: demoUser.id,
      workspaceId: workspace.id,
      versions: { create: { version: 1, createdBy: demoUser.id, content: '# Demo Notes\n\nReview, approve, and publish from one place.' } }
    }
  })
  await prisma.artifact.upsert({
    where: { id: 'artifact-demo-slides' },
    update: {},
    create: {
      id: 'artifact-demo-slides',
      name: 'agenthub-demo',
      type: 'slides',
      mimeType: 'application/json',
      userId: demoUser.id,
      workspaceId: workspace.id,
      versions: {
        create: {
          version: 1,
          createdBy: demoUser.id,
          content: JSON.stringify({ slides: [{ title: 'AgentHub', body: 'Multi-agent delivery with approval gates.' }, { title: 'Demo', body: 'Chat -> artifact -> approval -> deployment.' }] })
        }
      }
    }
  })
  console.log('Demo account: demo@agenthub.local / AgentHub123!')
}

main().finally(() => prisma.$disconnect())
