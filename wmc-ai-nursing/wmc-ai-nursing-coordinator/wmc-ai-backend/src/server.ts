import { createApp } from './app.js'
import { config } from './config/env.js'

const app = createApp()

app.listen(config.port, () => {
  console.log(`wmc-ai-backend listening on http://localhost:${config.port}`)
  console.log(`API base: http://localhost:${config.port}${config.apiPrefix}`)
})
