import express from 'express'
import { cancelAgentRun, createAgentRun, getAgentRun, listAgentRuns, retryAgentRun, streamAgentRunEvents } from '../controllers/AgentRunController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()

router.get('/:runId/events', streamAgentRunEvents)
router.use(requireAuth)
router.get('/', listAgentRuns)
router.post('/', createAgentRun)
router.get('/:runId', getAgentRun)
router.post('/:runId/cancel', cancelAgentRun)
router.post('/:runId/retry', retryAgentRun)

export default router
