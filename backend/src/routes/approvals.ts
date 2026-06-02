import express from 'express'
import { createApproval, listApprovals, resolveApproval } from '../controllers/ApprovalController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()
router.use(requireAuth)
router.get('/', listApprovals)
router.post('/', createApproval)
router.post('/:id/resolve', resolveApproval)
export default router

