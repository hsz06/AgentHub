/// <reference path="../src/types/bcryptjs.d.ts" />

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

const prisma = new PrismaClient()

function contentHash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

async function writeDemoWorkspaceFiles(workspaceId: string, userId: string, rootPath: string) {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      scripts: {
        start: 'node server.js'
      },
      dependencies: {}
    }, null, 2),
    'server.js': `const http = require('http')
const fs = require('fs')
const path = require('path')

const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 3000)
const publicDir = path.join(__dirname, 'public')
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }

http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  const filePath = path.join(publicDir, path.normalize(urlPath).replace(/^([/\\\\])+/, ''))
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' })
    res.end(content)
  })
}).listen(port, host, () => {
  console.log(\`AgentHub demo workspace running at http://\${host}:\${port}\`)
})
`,
    'README.md': `# AgentHub Demo Workspace

This dependency-free workspace is created by the AgentHub seed script.

- \`npm run start\` serves the static demo page.
- Coding Agents can safely propose edits to files under \`public/\`.
- AgentHub converts file changes into approval records before writing them back.
`,
    'public/index.html': `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AgentHub Demo Workspace</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">AGENTHUB LOCAL DEMO</p>
        <h1>多 Agent 协作任务台</h1>
        <p class="lead">这个页面用于演示 Claude Code / Codex 在受控 workspace 中提出修改, 再由 AgentHub 审批写回。</p>
      </section>
      <section class="stats" aria-label="任务统计">
        <article><strong id="total">3</strong><span>总任务</span></article>
        <article><strong id="done">1</strong><span>已完成</span></article>
        <article><strong id="todo">2</strong><span>待处理</span></article>
      </section>
      <section class="panel">
        <h2>演示任务</h2>
        <ul id="tasks">
          <li><label><input type="checkbox" checked /> 配置 CLI Runtime</label></li>
          <li><label><input type="checkbox" /> 让 Agent 提出页面修改</label></li>
          <li><label><input type="checkbox" /> 审批 Diff 并启动本机预览</label></li>
        </ul>
      </section>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
`,
    'public/styles.css': `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f4f0e6;
  color: #27231f;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
}

.shell {
  width: min(920px, calc(100vw - 32px));
}

.hero {
  margin-bottom: 24px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.16em;
  color: #6f695d;
}

h1 {
  margin: 0;
  font-size: clamp(40px, 8vw, 84px);
  line-height: 0.98;
}

.lead {
  max-width: 620px;
  font-size: 18px;
  line-height: 1.7;
  color: #625c51;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 28px 0;
}

.stats article,
.panel {
  border: 1px solid #d8d0bd;
  background: #fffaf0;
  border-radius: 8px;
  padding: 18px;
}

.stats strong {
  display: block;
  font-size: 36px;
}

.stats span {
  color: #766f62;
}

.panel h2 {
  margin-top: 0;
}

li {
  margin: 10px 0;
  font-size: 16px;
}
`,
    'public/app.js': `const tasks = Array.from(document.querySelectorAll('#tasks input'))

function refreshStats() {
  const done = tasks.filter(item => item.checked).length
  document.querySelector('#total').textContent = String(tasks.length)
  document.querySelector('#done').textContent = String(done)
  document.querySelector('#todo').textContent = String(tasks.length - done)
}

tasks.forEach(item => item.addEventListener('change', refreshStats))
refreshStats()
`
  }

  await fs.mkdir(rootPath, { recursive: true })
  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const target = path.join(rootPath, relativePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, 'utf8')
  }))
  await prisma.workspaceFileRevision.deleteMany({ where: { workspaceId } })
  await prisma.workspaceFileRevision.createMany({
    data: Object.entries(files).map(([filePath, content]) => ({
      workspaceId,
      userId,
      filePath,
      contentHash: contentHash(content),
      content,
      operation: 'seed'
    }))
  })
}

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
    update: { rootPath: 'data/workspaces/user-demo/workspace-demo', conversationId: conversation.id },
    create: {
      id: 'workspace-demo',
      name: 'Landing Page Demo',
      rootPath: 'data/workspaces/user-demo/workspace-demo',
      userId: demoUser.id,
      conversationId: conversation.id
    }
  })
  await writeDemoWorkspaceFiles(workspace.id, demoUser.id, workspace.rootPath)
  const webArtifact = await prisma.artifact.upsert({
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
  const documentArtifact = await prisma.artifact.upsert({
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
  const slidesArtifact = await prisma.artifact.upsert({
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
  const [webVersion, documentVersion, slidesVersion] = await Promise.all([
    prisma.artifactVersion.findFirst({ where: { artifactId: webArtifact.id }, orderBy: { version: 'desc' } }),
    prisma.artifactVersion.findFirst({ where: { artifactId: documentArtifact.id }, orderBy: { version: 'desc' } }),
    prisma.artifactVersion.findFirst({ where: { artifactId: slidesArtifact.id }, orderBy: { version: 'desc' } })
  ])
  if (!webVersion || !documentVersion || !slidesVersion) throw new Error('Seeded demo artifacts must have versions')
  const demoArtifactMessage = await prisma.message.upsert({
    where: { id: 'message-demo-artifacts' },
    update: {
      content: '已准备好演示产物：网页预览、Markdown 附件和 Slides，可直接在聊天流中预览、下载或导出。',
      metadata: JSON.stringify({
        preview_cards: [
          {
            type: 'web-preview',
            title: webArtifact.name,
            description: '隔离 iframe 网页预览',
            data: { artifactId: webArtifact.id, versionId: webVersion.id }
          },
          {
            type: 'file-attachment',
            title: documentArtifact.name,
            description: 'Markdown 文档附件',
            data: { artifactId: documentArtifact.id, versionId: documentVersion.id, fileName: documentArtifact.name, fileType: 'Markdown' }
          },
          {
            type: 'slides',
            title: slidesArtifact.name,
            description: '可导出 PPTX 的演示文稿',
            data: { artifactId: slidesArtifact.id, versionId: slidesVersion.id, fileName: slidesArtifact.name, fileType: 'Slides' }
          }
        ]
      }),
      status: 'completed'
    },
    create: {
      id: 'message-demo-artifacts',
      conversationId: conversation.id,
      senderType: 'system',
      senderId: mimoAgent.id,
      agentId: mimoAgent.id,
      content: '已准备好演示产物：网页预览、Markdown 附件和 Slides，可直接在聊天流中预览、下载或导出。',
      messageType: 'text',
      metadata: JSON.stringify({
        preview_cards: [
          {
            type: 'web-preview',
            title: webArtifact.name,
            description: '隔离 iframe 网页预览',
            data: { artifactId: webArtifact.id, versionId: webVersion.id }
          },
          {
            type: 'file-attachment',
            title: documentArtifact.name,
            description: 'Markdown 文档附件',
            data: { artifactId: documentArtifact.id, versionId: documentVersion.id, fileName: documentArtifact.name, fileType: 'Markdown' }
          },
          {
            type: 'slides',
            title: slidesArtifact.name,
            description: '可导出 PPTX 的演示文稿',
            data: { artifactId: slidesArtifact.id, versionId: slidesVersion.id, fileName: slidesArtifact.name, fileType: 'Slides' }
          }
        ]
      }),
      status: 'completed'
    }
  })
  await prisma.artifactVersion.updateMany({
    where: { id: { in: [webVersion.id, documentVersion.id, slidesVersion.id] } },
    data: { messageId: demoArtifactMessage.id }
  })
  await prisma.orchestrationRun.upsert({
    where: { id: 'orchestration-demo-run' },
    update: {
      request: '@Codex @Claude @MiMo 协作检查 demo workspace，准备预览、评审和部署计划。',
      status: 'completed',
      result: 'Demo collaboration completed: Codex prepared the workspace changes, Claude reviewed the delivery notes, and MiMo prepared deployment guidance.',
      completedAt: new Date(),
      state: JSON.stringify({
        plan: [
          { key: 't1', title: 'Codex implementation pass', agentId: gptAgent.id, input: '检查 demo workspace 并准备可演示页面。', dependencies: [] },
          { key: 't2', title: 'Claude review pass', agentId: claudeAgent.id, input: '审查 demo 交付说明和风险边界。', dependencies: ['t1'] },
          { key: 't3', title: 'MiMo deployment pass', agentId: mimoAgent.id, input: '确认本机部署和审批演示路径。', dependencies: ['t1', 't2'] }
        ],
        taskIdsByKey: {
          t1: 'orchestration-demo-task-codex',
          t2: 'orchestration-demo-task-claude',
          t3: 'orchestration-demo-task-mimo'
        }
      })
    },
    create: {
      id: 'orchestration-demo-run',
      conversationId: conversation.id,
      userId: demoUser.id,
      mode: 'graph',
      status: 'completed',
      request: '@Codex @Claude @MiMo 协作检查 demo workspace，准备预览、评审和部署计划。',
      result: 'Demo collaboration completed: Codex prepared the workspace changes, Claude reviewed the delivery notes, and MiMo prepared deployment guidance.',
      completedAt: new Date(),
      state: JSON.stringify({
        plan: [
          { key: 't1', title: 'Codex implementation pass', agentId: gptAgent.id, input: '检查 demo workspace 并准备可演示页面。', dependencies: [] },
          { key: 't2', title: 'Claude review pass', agentId: claudeAgent.id, input: '审查 demo 交付说明和风险边界。', dependencies: ['t1'] },
          { key: 't3', title: 'MiMo deployment pass', agentId: mimoAgent.id, input: '确认本机部署和审批演示路径。', dependencies: ['t1', 't2'] }
        ],
        taskIdsByKey: {
          t1: 'orchestration-demo-task-codex',
          t2: 'orchestration-demo-task-claude',
          t3: 'orchestration-demo-task-mimo'
        }
      })
    }
  })
  await Promise.all([
    prisma.orchestrationTask.upsert({
      where: { id: 'orchestration-demo-task-codex' },
      update: {
        runId: 'orchestration-demo-run',
        agentId: gptAgent.id,
        title: 'Codex implementation pass',
        input: '检查 demo workspace 并准备可演示页面。',
        output: 'Codex prepared the seed workspace and verified package.json scripts.start for local preview.',
        dependencies: JSON.stringify([]),
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date()
      },
      create: {
        id: 'orchestration-demo-task-codex',
        runId: 'orchestration-demo-run',
        agentId: gptAgent.id,
        title: 'Codex implementation pass',
        input: '检查 demo workspace 并准备可演示页面。',
        output: 'Codex prepared the seed workspace and verified package.json scripts.start for local preview.',
        dependencies: JSON.stringify([]),
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date()
      }
    }),
    prisma.orchestrationTask.upsert({
      where: { id: 'orchestration-demo-task-claude' },
      update: {
        runId: 'orchestration-demo-run',
        agentId: claudeAgent.id,
        title: 'Claude review pass',
        input: '审查 demo 交付说明和风险边界。',
        output: 'Claude reviewed the delivery notes and confirmed the local runner boundary is documented.',
        dependencies: JSON.stringify(['t1']),
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date()
      },
      create: {
        id: 'orchestration-demo-task-claude',
        runId: 'orchestration-demo-run',
        agentId: claudeAgent.id,
        title: 'Claude review pass',
        input: '审查 demo 交付说明和风险边界。',
        output: 'Claude reviewed the delivery notes and confirmed the local runner boundary is documented.',
        dependencies: JSON.stringify(['t1']),
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date()
      }
    }),
    prisma.orchestrationTask.upsert({
      where: { id: 'orchestration-demo-task-mimo' },
      update: {
        runId: 'orchestration-demo-run',
        agentId: mimoAgent.id,
        title: 'MiMo deployment pass',
        input: '确认本机部署和审批演示路径。',
        output: 'MiMo confirmed the deployment command creates an approval and the worker returns a token-protected preview URL.',
        dependencies: JSON.stringify(['t1', 't2']),
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date()
      },
      create: {
        id: 'orchestration-demo-task-mimo',
        runId: 'orchestration-demo-run',
        agentId: mimoAgent.id,
        title: 'MiMo deployment pass',
        input: '确认本机部署和审批演示路径。',
        output: 'MiMo confirmed the deployment command creates an approval and the worker returns a token-protected preview URL.',
        dependencies: JSON.stringify(['t1', 't2']),
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date()
      }
    })
  ])
  console.log('Demo account: demo@agenthub.local / AgentHub123!')
}

main().finally(() => prisma.$disconnect())
