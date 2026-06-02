import express from 'express'
import { createDeployment, listDeployments, logs, previewDeployment, redeploy, runtimeProxy, stopDeployment } from '../controllers/DeploymentController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()
router.get('/:id/preview', previewDeployment)
router.all('/:id/runtime', runtimeProxy)
router.all('/:id/runtime/*', runtimeProxy)
router.use(requireAuth)
router.get('/', listDeployments)
router.post('/', createDeployment)
router.post('/:id/stop', stopDeployment)
router.post('/:id/redeploy', redeploy)
router.get('/:id/logs', logs)
export default router
