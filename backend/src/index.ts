import express, { Request, Response, NextFunction } from 'express'
import http from 'http'
import cors from 'cors'
import dotenv from 'dotenv'
import { setupSocketIO } from './sockets'
import conversationsRouter from './routes/conversations'
import messagesRouter from './routes/messages'
import agentsRouter from './routes/agents'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', '*'],
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

app.use('/api/conversations', conversationsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/agents', agentsRouter)

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

httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`)
})
