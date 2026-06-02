import express from 'express'
import { deleteProviderKey, listCliRuntimes, listProviders, setCliRuntime, setProviderConfig, testCliRuntimeConfig, testProvider } from '../controllers/SettingsController'
import { requireAuth } from '../middleware/auth'

const router = express.Router()

router.use(requireAuth)
router.get('/providers', listProviders)
router.put('/providers/:provider', setProviderConfig)
router.post('/providers/:provider/test', testProvider)
router.delete('/providers/:provider', deleteProviderKey)
router.get('/cli-runtimes', listCliRuntimes)
router.put('/cli-runtimes/:runtimeType', setCliRuntime)
router.post('/cli-runtimes/:runtimeType/test', testCliRuntimeConfig)

export default router
