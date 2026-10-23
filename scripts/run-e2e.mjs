// Serves dist/ with `vite preview`, runs the browser tests against it, then stops the server.
// First time only: npx playwright install chromium
import { spawn } from 'node:child_process'

const port = 4173
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
const stop = () => srv.kill()
process.on('exit', stop)

const url = `http://localhost:${port}/`
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(url)).ok) break
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 200))
}
const t = spawn('node', ['--test', 'tests/e2e/app.e2e.mjs'], { stdio: 'inherit', env: { ...process.env, E2E_URL: url } })
t.on('exit', (code) => {
  stop()
  process.exit(code ?? 1)
})
