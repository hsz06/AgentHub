require('dotenv').config()
const { io } = require('../../../frontend/node_modules/socket.io-client')

const apiBase = process.env.SMOKE_API_BASE || `http://127.0.0.1:${process.env.PORT || 3001}/api`
const socketUrl = process.env.SMOKE_SOCKET_URL || `http://127.0.0.1:${process.env.PORT || 3001}`

async function request(path, options = {}) {
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
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${text}`)
  return body
}

function waitFor(socket, event, predicate, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeoutMs)
    const handler = payload => {
      if (!predicate(payload)) return
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(payload)
    }
    socket.on(event, handler)
  })
}

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@agenthub.local', password: 'AgentHub123!' })
  })
  const token = login.token
  console.log(`login: ${login.user.email}`)

  const socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling']
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out connecting socket')), 15000)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('connect_error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
  console.log(`socket: connected ${socket.id}`)

  socket.emit('conversation:join', 'conversation-demo')

  const customAgentName = `Smoke Agent ${Date.now()}`
  const agentCreatedPromise = waitFor(socket, 'agent:created', agent =>
    agent.name === customAgentName
  )
  const agentMessagePromise = waitFor(socket, 'message:created', message =>
    message.conversationId === 'conversation-demo'
      && message.senderType === 'system'
      && String(message.content || '').includes(`已创建自定义 Agent：${customAgentName}`)
  )
  socket.emit('message:send', {
    conversationId: 'conversation-demo',
    content: `/agent name="${customAgentName}" prompt="你是 AgentHub 实时冒烟测试创建的临时 Agent。" provider=mimo tags=smoke,realtime`
  })
  const createdAgent = await agentCreatedPromise
  await agentMessagePromise
  console.log(`chat-agent-created: ${createdAgent.id} ${createdAgent.name}`)
  await request(`/agents/${createdAgent.id}`, { token, method: 'DELETE' })
  console.log('chat-agent-cleanup: deleted')

  const deploymentMessagePromise = waitFor(socket, 'message:created', message =>
    message.conversationId === 'conversation-demo' && message.messageType === 'deployment'
  )
  const approvalPromise = waitFor(socket, 'tool:approval-created', approval =>
    approval.type === 'deployment' && approval.workspaceId === 'workspace-demo'
  )

  socket.emit('message:send', {
    conversationId: 'conversation-demo',
    content: '/deploy'
  })

  const deploymentMessage = await deploymentMessagePromise
  const approval = await approvalPromise
  const metadata = typeof deploymentMessage.metadata === 'string' ? JSON.parse(deploymentMessage.metadata) : deploymentMessage.metadata
  const deploymentId = metadata?.preview_cards?.[0]?.data?.deploymentId
  if (!deploymentId) throw new Error('Deployment status message did not include deploymentId')
  console.log(`chat-deployment-message: ${deploymentMessage.id} deployment=${deploymentId}`)
  console.log(`chat-approval-created: ${approval.id}`)

  const successPromise = waitFor(socket, 'deployment:state', state =>
    state.deploymentId === deploymentId && ['success', 'failed'].includes(state.status),
    45000
  )
  await request(`/approvals/${approval.id}/resolve`, {
    token,
    method: 'POST',
    body: JSON.stringify({ action: 'approve' })
  })
  console.log('chat-approval: approved')

  const finalState = await successPromise
  console.log(`chat-deployment-final: ${finalState.status} preview=${finalState.previewUrl || ''}`)
  if (finalState.status !== 'success') throw new Error(`Deployment failed: ${finalState.errorMsg || 'unknown error'}`)
  if (!finalState.previewUrl) throw new Error('Successful realtime deployment has no previewUrl')

  await request(`/deployments/${deploymentId}/stop`, { token, method: 'POST' })
  console.log('chat-deployment-stop: stopped')
  socket.disconnect()
}

main().catch(error => {
  console.error(`realtime-smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
