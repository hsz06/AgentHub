import { execFile } from 'child_process'
import { promisify } from 'util'
import { getOwnedWorkspace } from './WorkspaceFileService'

const execFileAsync = promisify(execFile)
const COMMANDS: Record<string, string[]> = {
  'npm install': ['npm', 'install'],
  'npm run build': ['npm', 'run', 'build'],
  'npm test': ['npm', 'test'],
  'npm run test': ['npm', 'run', 'test'],
  'npm run lint': ['npm', 'run', 'lint']
}

export function isAllowedCommand(command: string) {
  return Boolean(COMMANDS[command])
}

export async function executeApprovedCommand(userId: string, workspaceId: string, command: string) {
  const args = COMMANDS[command]
  if (!args) throw new Error('Command is not in the allowed list')
  if (process.env.SANDBOX_EXECUTION_ENABLED !== 'true') throw new Error('Docker sandbox execution is disabled')
  const workspace = await getOwnedWorkspace(userId, workspaceId)
  const network = command === 'npm install' ? (process.env.SANDBOX_INSTALL_NETWORK || 'bridge') : 'none'
  const dockerArgs = [
    'run', '--rm', '--cpus', '1', '--memory', '512m', '--pids-limit', '128',
    '--security-opt', 'no-new-privileges', '--network', network,
    '-v', `${workspace.rootPath}:/workspace`, '-w', '/workspace',
    'node:20-alpine', ...args
  ]
  const { stdout, stderr } = await execFileAsync('docker', dockerArgs, { timeout: 120000 })
  return `${stdout}${stderr}`.slice(0, 8000)
}
