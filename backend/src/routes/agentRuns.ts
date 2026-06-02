import express from 'express'
import { cancelAgentRun, createAgentRun, getAgentRun, streamAgentRunEvents } from '../controllers/AgentRunController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()

router.get('/:runId/events', streamAgentRunEvents)
router.use(requireAuth)
router.post('/', createAgentRun)
router.get('/:runId', getAgentRun)
router.post('/:runId/cancel', cancelAgentRun)

export default router
