import express from 'express'
import { getMessages, getMessageById, togglePinMessage } from '../controllers/MessageController'

const router = express.Router()

router.get('/conversation/:conversationId', getMessages)
router.get('/:id', getMessageById)
router.patch('/:id/toggle-pin', togglePinMessage)

export default router
