import express, { Request, Response, NextFunction } from 'express'
import http from 'http'
import cors from 'cors'
import dotenv from 'dotenv'
import { setupSocketIO } from './sockets'
import conversationsRouter from './routes/conversations'
import messagesRouter from './routes/messages'
import agentsRouter from './routes/agents'
import authRouter from './routes/auth'
import settingsRouter from './routes/settings'
import artifactsRouter from './routes/artifacts'
import approvalsRouter from './routes/approvals'
import deploymentsRouter from './routes/deployments'
import workspacesRouter from './routes/workspaces'
import agentRunsRouter from './routes/agentRuns'
import { AgentManager } from './services/agents/AgentManager'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

const corsOptions = {
  origin: (process.env.FRONTEND_URL || 'http://localhost:5173').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}

app.use(cors(corsOptions))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running!' })
})

app.use('/api/auth', authRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/workspaces', workspacesRouter)
app.use('/api/artifacts', artifactsRouter)
app.use('/api/approvals', approvalsRouter)
app.use('/api/deployments', deploymentsRouter)
app.use('/api/agent-runs', agentRunsRouter)

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' })
})

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', err)
  res.status(500).json({ 
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  })
})

const httpServer = http.createServer(app)
setupSocketIO(httpServer)

httpServer.listen(PORT, async () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`)
  try {
    await AgentManager.getInstance().initializeFromDatabase()
    console.log('✅ AgentManager initialized from database')
  } catch (e) {
    console.warn('AgentManager initialization skipped', e)
  }
})
