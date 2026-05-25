import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../../wmc-ai-nursing-coordinator')
process.chdir(projectRoot)
await import('../../wmc-ai-nursing-coordinator/src/bot/index.js')
