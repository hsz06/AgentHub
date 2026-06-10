import { execFile } from 'child_process'
import { promisify } from 'util'
import { ensureLocalExecutionEnabled, localProcessEnv } from './CliRuntimeService'
import { getOwnedWorkspace } from './WorkspaceFileService'

const execFileAsync = promisify(execFile)
const COMMANDS: Record<string, string[]> = {
  'npm install': ['install'],
  'npm run build': ['run', 'build'],
  'npm test': ['test'],
  'npm run test': ['run', 'test'],
  'npm run lint': ['run', 'lint']
}

export function isAllowedCommand(command: string) {
  return Boolean(COMMANDS[command])
}

export async function executeApprovedCommand(userId: string, workspaceId: string, command: string) {
  const args = COMMANDS[command]
  if (!args) throw new Error('Command is not in the allowed list')
  ensureLocalExecutionEnabled()
  const workspace = await getOwnedWorkspace(userId, workspaceId)
  const npmBin = process.env.NPM_BIN || 'npm'
  const { stdout, stderr } = await execFileAsync(npmBin, args, {
    cwd: workspace.rootPath,
    env: localProcessEnv(npmBin),
    timeout: 120000,
    maxBuffer: 1024 * 1024
  })
  return `${stdout}${stderr}`.slice(0, 8000)
}
