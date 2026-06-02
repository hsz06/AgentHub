import express from 'express'
import { login, me, register } from '../controllers/AuthController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()

router.post('/register', register)
router.post('/login', login)
router.get('/me', requireAuth, me)

export default router

