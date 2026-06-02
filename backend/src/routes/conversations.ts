import express from 'express'
import {
  getConversations,
  getConversationById,
  createConversation,
  updateConversation,
  deleteConversation,
  getOrchestrationRuns
} from '../controllers/ConversationController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()

router.use(requireAuth)
router.get('/', getConversations)
router.get('/:id', getConversationById)
router.get('/:id/orchestrations', getOrchestrationRuns)
router.post('/', createConversation)
router.put('/:id', updateConversation)
router.delete('/:id', deleteConversation)

export default router
