import express from 'express'
import { createArtifact, createVersion, downloadArtifact, exportSlides, getArtifact, getVersionContent, listArtifacts } from '../controllers/ArtifactController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()
router.use(requireAuth)
router.get('/', listArtifacts)
router.post('/', createArtifact)
router.get('/:id', getArtifact)
router.get('/:id/download', downloadArtifact)
router.post('/:id/export/pptx', exportSlides)
router.post('/:id/versions', createVersion)
router.get('/:id/versions/:versionId', getVersionContent)
export default router
