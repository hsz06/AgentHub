import express from 'express'
import { getAgents, getAgentById, createAgent, updateAgent, deleteAgent } from '../controllers/AgentController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()

router.use(requireAuth)
router.get('/', getAgents)
router.get('/:id', getAgentById)
router.post('/', createAgent)
router.patch('/:id', updateAgent)
router.delete('/:id', deleteAgent)

export default router
