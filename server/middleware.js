import { PROVIDERS, getProvider } from './providers/index.js'
import { loadTaskConfig, saveTaskConfig } from './config-store.js'

function sendJson(res, status, data) {
  const payload = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

export function createTaskBoardMiddleware() {
  return async function taskBoardMiddleware(req, res, next) {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/taskboard')) {
      return next ? next() : sendJson(res, 404, { error: 'Not found' })
    }

    try {
      // GET /api/taskboard/config - Returns registered providers and active config
      if (url.pathname === '/api/taskboard/config' && req.method === 'GET') {
        const config = await loadTaskConfig()
        const providers = PROVIDERS.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          fields: p.fields,
        }))
        return sendJson(res, 200, { config, providers })
      }

      // POST /api/taskboard/config - Saves user configuration
      if (url.pathname === '/api/taskboard/config' && req.method === 'POST') {
        const body = await readBody(req)
        await saveTaskConfig(body)
        return sendJson(res, 200, { ok: true })
      }

      // POST /api/taskboard/test - Tests connection for a specific provider
      if (url.pathname === '/api/taskboard/test' && req.method === 'POST') {
        const { providerId, config } = await readBody(req)
        const provider = getProvider(providerId)
        if (!provider) return sendJson(res, 400, { ok: false, error: `Unknown provider: ${providerId}` })
        const result = await provider.test(config || {})
        return sendJson(res, result.ok ? 200 : 400, result)
      }

      // GET /api/taskboard/tasks - Returns tasks from configured provider
      if (url.pathname === '/api/taskboard/tasks' && req.method === 'GET') {
        const config = await loadTaskConfig()
        const activeId = config.active || 'github'
        const provider = getProvider(activeId)

        let tasks = []
        if (provider) {
          const providerConfig = config.providers?.[activeId] || {}
          tasks = await provider.fetchTasks(providerConfig, {
            repos: [], // Can be populated from active colony threads if desired
          })
        }

        return sendJson(res, 200, {
          tasks,
          provider: activeId,
          providerName: provider?.name || activeId,
          scannedAt: Date.now(),
        })
      }

      return sendJson(res, 404, { error: 'Unknown taskboard route' })
    } catch (err) {
      return sendJson(res, 500, { error: err.message })
    }
  }
}
