import express from 'express'
import {
  getConversations,
  getConversationById,
  createConversation,
  updateConversation,
  deleteConversation
} from '../controllers/ConversationController'

const router = express.Router()

router.get('/', getConversations)
router.get('/:id', getConversationById)
router.post('/', createConversation)
router.put('/:id', updateConversation)
router.delete('/:id', deleteConversation)

export default router
