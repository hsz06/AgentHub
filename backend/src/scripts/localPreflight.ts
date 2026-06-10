import { execFile } from 'child_process'
import { promisify } from 'util'
import { localProcessEnv } from '../services/CliRuntimeService'

const execFileAsync = promisify(execFile)

async function check(label: string, executablePath: string, args = ['--version']) {
  try {
    const result = await execFileAsync(executablePath, args, { env: localProcessEnv(executablePath), timeout: 15000 })
    console.log(`${label}: ${result.stdout.trim() || result.stderr.trim() || 'ok'}`)
  } catch (error) {
    console.error(`${label}: unavailable (${error instanceof Error ? error.message : String(error)})`)
    process.exitCode = 1
  }
}

async function main() {
  const major = Number(process.versions.node.split('.')[0])
  console.log(`node: ${process.version}`)
  if (major < 20) {
    console.error('node: AgentHub local runner requires Node 20 or newer')
    process.exitCode = 1
  }
  await check('npm', process.env.NPM_BIN || 'npm')
  await check('claude', process.env.CLAUDE_CODE_BIN || 'claude')
  await check('claude auth', process.env.CLAUDE_CODE_BIN || 'claude', ['auth', 'status'])
}

void main()
