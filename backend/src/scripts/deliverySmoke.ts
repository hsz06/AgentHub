import dotenv from 'dotenv'
import prisma from '../utils/prisma'

dotenv.config()

const apiBase = process.env.SMOKE_API_BASE || `http://127.0.0.1:${process.env.PORT || 3001}/api`
const apiOrigin = new URL(apiBase).origin
const createdIds: { versionId?: string; deploymentId?: string; approvalId?: string } = {}
const smokeDocumentContent = '# Demo Notes\n\nDelivery smoke version.'

type RequestOptions = RequestInit & { token?: string; json?: boolean }

async function requestText(path: string, options: RequestOptions = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.json === false ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    }
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${text}`)
  return { response, text }
}

async function requestJson<T>(path: string, options: RequestOptions = {}) {
  const { text } = await requestText(path, options)
  return (text ? JSON.parse(text) : null) as T
}

async function requestBytes(path: string, options: RequestOptions = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    }
  })
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${bytes.toString('utf8')}`)
  return { response, bytes }
}

async function main() {
  await cleanupStaleSmokeRecords()
  const login = await requestJson<{ token: string; user: { email: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@agenthub.local', password: 'AgentHub123!' })
  })
  const token = login.token
  console.log(`login: ${login.user.email}`)

  const artifacts = await requestJson<Array<{ id: string; name: string; type: string; versions?: Array<{ id: string; version: number }> }>>('/artifacts', { token })
  const web = artifacts.find(item => item.id === 'artifact-demo-page')
  const document = artifacts.find(item => item.id === 'artifact-demo-document')
  const slides = artifacts.find(item => item.id === 'artifact-demo-slides')
  if (!web || !document || !slides) throw new Error('Seeded web/document/slides artifacts are missing from API')
  console.log(`artifacts: ${artifacts.length}`)

  const documentDownload = await requestBytes(`/artifacts/${document.id}/download`, { token })
  if (!documentDownload.bytes.toString('utf8').includes('Demo Notes')) throw new Error('Document download did not contain seeded content')
  console.log(`artifact-download: ${document.name} bytes=${documentDownload.bytes.length}`)

  const pptx = await requestBytes(`/artifacts/${slides.id}/export/pptx`, { token, method: 'POST' })
  if (pptx.bytes.length < 1000 || !pptx.bytes.subarray(0, 2).equals(Buffer.from('PK'))) throw new Error('Slides PPTX export did not return a valid zip-based PPTX payload')
  console.log(`slides-export: bytes=${pptx.bytes.length}`)

  const version = await requestJson<{ id: string; version: number; content: string }>(`/artifacts/${document.id}/versions`, {
    token,
    method: 'POST',
    body: JSON.stringify({ content: smokeDocumentContent })
  })
  createdIds.versionId = version.id
  const fetchedVersion = await requestJson<{ id: string; version: number; content: string }>(`/artifacts/${document.id}/versions/${version.id}`, { token })
  if (fetchedVersion.version !== version.version || !fetchedVersion.content.includes('Delivery smoke')) throw new Error('Artifact version round trip failed')
  console.log(`artifact-version: v${version.version}`)

  const workspaces = await requestJson<Array<{ id: string; name: string }>>('/workspaces', { token })
  const workspace = workspaces.find(item => item.id === 'workspace-demo')
  if (!workspace) throw new Error('workspace-demo missing from API')
  const exported = await requestBytes(`/workspaces/${workspace.id}/export`, { token })
  if (exported.bytes.length < 1000 || !exported.bytes.subarray(0, 2).equals(Buffer.from('PK'))) throw new Error('Workspace export did not return a valid ZIP payload')
  console.log(`workspace-export: ${workspace.name} bytes=${exported.bytes.length}`)

  const deployment = await requestJson<{ id: string; approvals?: Array<{ id: string }> }>('/deployments', {
    token,
    method: 'POST',
    body: JSON.stringify({ name: `static delivery smoke ${new Date().toISOString()}`, type: 'static', artifactId: web.id })
  })
  const approval = deployment.approvals?.[0]
  if (!approval) throw new Error('Static deployment approval missing')
  createdIds.deploymentId = deployment.id
  createdIds.approvalId = approval.id
  console.log(`static-deployment: ${deployment.id} approval=${approval.id}`)

  const approved = await requestJson<{ status: string; result?: string }>(`/approvals/${approval.id}/resolve`, {
    token,
    method: 'POST',
    body: JSON.stringify({ action: 'approve' })
  })
  if (approved.status !== 'approved') throw new Error(`Static deployment approval did not approve: ${approved.status}`)

  const deployments = await requestJson<Array<{ id: string; status: string; previewUrl?: string }>>('/deployments', { token })
  const published = deployments.find(item => item.id === deployment.id)
  if (published?.status !== 'success' || !published.previewUrl) throw new Error('Static deployment did not publish a preview URL')
  const previewResponse = await fetch(`${apiOrigin}${published.previewUrl}`)
  const previewText = await previewResponse.text()
  if (!previewResponse.ok) throw new Error(`GET ${published.previewUrl} -> ${previewResponse.status}: ${previewText}`)
  if (!previewText.includes('<h1>AgentHub</h1>') || !previewText.includes('Secure multi-agent collaboration workspace')) {
    throw new Error('Static deployment preview did not return seeded Web Artifact HTML')
  }
  console.log(`static-preview: ${published.previewUrl}`)
}

async function cleanupStaleSmokeRecords() {
  const staleDeployments = await prisma.deployment.findMany({
    where: { userId: 'user-demo', name: { startsWith: 'static delivery smoke ' } },
    select: { id: true }
  })
  const staleDeploymentIds = staleDeployments.map(item => item.id)
  if (staleDeploymentIds.length) {
    await prisma.toolApproval.deleteMany({ where: { deploymentId: { in: staleDeploymentIds } } })
    await prisma.deployment.deleteMany({ where: { id: { in: staleDeploymentIds } } })
  }

  const staleVersions = await prisma.artifactVersion.findMany({
    where: { artifactId: 'artifact-demo-document', content: smokeDocumentContent },
    orderBy: { version: 'desc' },
    select: { id: true }
  })
  if (staleVersions.length) {
    await prisma.artifactVersion.deleteMany({ where: { id: { in: staleVersions.map(item => item.id) } } })
  }

  if (staleDeploymentIds.length || staleVersions.length) {
    console.log(`pre-cleanup: removed deployments=${staleDeploymentIds.length} versions=${staleVersions.length}`)
  }
}

async function cleanup() {
  if (createdIds.approvalId) await prisma.toolApproval.deleteMany({ where: { id: createdIds.approvalId } })
  if (createdIds.deploymentId) await prisma.deployment.deleteMany({ where: { id: createdIds.deploymentId } })
  if (createdIds.versionId) await prisma.artifactVersion.deleteMany({ where: { id: createdIds.versionId } })
  if (createdIds.approvalId || createdIds.deploymentId || createdIds.versionId) console.log('cleanup: temporary delivery smoke records removed')
}

main()
  .catch(error => {
    console.error(`delivery-smoke failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await cleanup()
    } catch (error) {
      console.warn(`delivery-smoke cleanup warning: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      await prisma.$disconnect()
    }
  })
