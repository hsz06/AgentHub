import express from 'express'
import { createWorkspace, deleteWorkspace, exportWorkspaceArchive, getFile, getTree, importWorkspaceArchive, listWorkspaces, updateWorkspace } from '../controllers/WorkspaceController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()
router.use(requireAuth)
router.get('/', listWorkspaces)
router.post('/', createWorkspace)
router.patch('/:id', updateWorkspace)
router.get('/:id/tree', getTree)
router.get('/:id/file', getFile)
router.post('/:id/import', importWorkspaceArchive)
router.get('/:id/export', exportWorkspaceArchive)
router.delete('/:id', deleteWorkspace)
export default router
