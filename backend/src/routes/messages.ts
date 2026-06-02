import express from 'express'
import { getMessages, getMessageById, togglePinMessage } from '../controllers/MessageController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()

router.use(requireAuth)
router.get('/conversation/:conversationId', getMessages)
router.get('/:id', getMessageById)
router.patch('/:id/toggle-pin', togglePinMessage)

export default router
