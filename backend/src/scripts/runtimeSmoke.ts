import dotenv from 'dotenv'

dotenv.config()

const apiBase = process.env.SMOKE_API_BASE || `http://127.0.0.1:${process.env.PORT || 3001}/api`

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    }
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${text}`)
  }
  return body as T
}

async function main() {
  const login = await request<{ token: string; user: { email: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@agenthub.local', password: 'AgentHub123!' })
  })
  const token = login.token
  console.log(`login: ${login.user.email}`)

  const conversations = await request<Array<{ id: string; title: string; members: unknown[] }>>('/conversations', { token })
  const conversation = conversations.find(item => item.id === 'conversation-demo')
  if (!conversation) throw new Error('conversation-demo missing from API')
  if (conversation.members.length < 3) throw new Error('conversation-demo must include at least three members')
  console.log(`conversation: ${conversation.title} members=${conversation.members.length}`)

  const workspaces = await request<Array<{ id: string; name: string; conversationId: string | null }>>('/workspaces', { token })
  const workspace = workspaces.find(item => item.id === 'workspace-demo')
  if (!workspace) throw new Error('workspace-demo missing from API')
  if (workspace.conversationId !== conversation.id) throw new Error('workspace-demo is not bound to conversation-demo')
  console.log(`workspace: ${workspace.name} bound=${workspace.conversationId}`)

  const tree = await request<Array<{ path: string; type: string }>>(`/workspaces/${workspace.id}/tree`, { token })
  for (const needed of ['package.json', 'server.js', 'public/index.html']) {
    if (!tree.some(item => item.path === needed && item.type === 'file')) throw new Error(`workspace tree missing ${needed}`)
  }
  console.log(`workspace-tree: files=${tree.filter(item => item.type === 'file').length}`)

  const packageFile = await request<{ content: string }>(`/workspaces/${workspace.id}/file?path=${encodeURIComponent('package.json')}`, { token })
  const packageJson = JSON.parse(packageFile.content) as { scripts?: Record<string, string> }
  if (!packageJson.scripts?.start) throw new Error('package.json has no scripts.start')
  console.log('workspace-file: package.json scripts.start ok')

  const deployment = await request<{ id: string; approvals?: Array<{ id: string }> }>('/deployments', {
    token,
    method: 'POST',
    body: JSON.stringify({ name: `runtime smoke ${new Date().toISOString()}`, type: 'fullstack', workspaceId: workspace.id })
  })
  const approval = deployment.approvals?.[0]
  if (!approval) throw new Error('deployment approval missing')
  console.log(`deployment-created: ${deployment.id} approval=${approval.id}`)

  const approved = await request<{ status: string; result?: string }>(`/approvals/${approval.id}/resolve`, {
    token,
    method: 'POST',
    body: JSON.stringify({ action: 'approve' })
  })
  console.log(`approval: ${approved.status} result=${approved.result || ''}`)

  let current: { id: string; status: string; previewUrl?: string | null; logs?: string | null } | undefined
  for (let attempt = 0; attempt < Number(process.env.SMOKE_DEPLOY_POLL_ATTEMPTS || 30); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const deployments = await request<Array<{ id: string; status: string; previewUrl?: string | null; logs?: string | null }>>('/deployments', { token })
    current = deployments.find(item => item.id === deployment.id)
    if (current && !['queued', 'starting'].includes(current.status)) break
  }
  if (!current) throw new Error('created deployment disappeared')
  console.log(`deployment-final: status=${current.status} preview=${current.previewUrl || ''}`)

  const logs = await request<unknown[]>(`/deployments/${deployment.id}/logs`, { token })
  console.log(`deployment-logs: ${logs.length}`)

  if (current.status !== 'success') {
    throw new Error(`deployment did not reach success: ${current.status} ${current.logs || ''}`)
  }
  if (!current.previewUrl) throw new Error('successful deployment has no previewUrl')

  const stopped = await request<{ status: string }>(`/deployments/${deployment.id}/stop`, {
    token,
    method: 'POST'
  })
  console.log(`deployment-stop: ${stopped.status}`)
}

main().catch(error => {
  console.error(`runtime-smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
