/**
 * Tests for AI Gateway — shared AI config sync module
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { DocMindClient } from '../lib/docmind-client.js'
import { AIGateway } from '../lib/ai-gateway.js'

// ==================== Helpers ====================

/** 创建可注入 mock fetch 的 DocMind 客户端 */
function createConnectedClient(responseMap = {}) {
  const fetchFn = async (url, options) => {
    const path = new URL(url).pathname
    const handler = responseMap[path]
    if (!handler) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }
    const body = handler(options)
    return new Response(JSON.stringify(body), { status: 200 })
  }
  const client = new DocMindClient({
    serverUrl: 'http://localhost:3000',
    apiKey: 'test-key',
    fetchFn,
  })
  client._connected = true
  return client
}

/** 创建 mock storage */
function createMockStorage() {
  const store = {}
  return {
    get: (keys, callback) => {
      const result = {}
      if (typeof keys === 'object' && keys !== null) {
        for (const [k, defaultVal] of Object.entries(keys)) {
          result[k] = store[k] !== undefined ? store[k] : defaultVal
        }
      }
      if (callback) callback(result)
      return result
    },
    set: (items, callback) => {
      Object.assign(store, items)
      if (callback) callback()
    },
    _store: store,
  }
}

// ==================== DocMindClient AI Gateway API ====================

describe('DocMindClient AI Gateway APIs', () => {
  describe('getAIConfig', () => {
    it('fetches AI config from DocMind', async () => {
      const client = createConnectedClient({
        '/api/v1/ai/config': () => ({
          provider: 'openai',
          model: 'gpt-4o',
          protocol: 'openai',
          base_url: 'https://api.openai.com',
          max_tokens: 4096,
          models: ['gpt-4o', 'gpt-4o-mini'],
          last_updated: '2026-05-10T10:00:00Z',
        }),
      })

      const result = await client.getAIConfig()
      assert.equal(result.success, true)
      assert.equal(result.config.provider, 'openai')
      assert.equal(result.config.model, 'gpt-4o')
      assert.equal(result.config.protocol, 'openai')
      assert.equal(result.config.baseUrl, 'https://api.openai.com')
      assert.equal(result.config.maxTokens, 4096)
      assert.deepEqual(result.config.models, ['gpt-4o', 'gpt-4o-mini'])
      assert.equal(result.config.lastUpdated, '2026-05-10T10:00:00Z')
    })

    it('handles camelCase response format', async () => {
      const client = createConnectedClient({
        '/api/v1/ai/config': () => ({
          provider: 'claude',
          model: 'claude-sonnet-4-6',
          protocol: 'claude',
          baseUrl: 'https://api.anthropic.com',
          maxTokens: 8192,
          models: [],
          lastUpdated: '2026-05-12T00:00:00Z',
        }),
      })

      const result = await client.getAIConfig()
      assert.equal(result.success, true)
      assert.equal(result.config.baseUrl, 'https://api.anthropic.com')
      assert.equal(result.config.maxTokens, 8192)
    })

    it('handles empty response', async () => {
      const client = createConnectedClient({
        '/api/v1/ai/config': () => ({}),
      })

      const result = await client.getAIConfig()
      assert.equal(result.success, true)
      assert.equal(result.config.provider, '')
      assert.equal(result.config.model, '')
      assert.equal(result.config.protocol, 'openai')
    })

    it('throws when not connected', async () => {
      const client = new DocMindClient({ fetchFn: async () => ({}) })
      client._connected = false

      await assert.rejects(
        () => client.getAIConfig(),
        (err) => {
          assert.ok(err.message.includes('未连接'))
          return true
        }
      )
    })

    it('handles network errors', async () => {
      const client = createConnectedClient({})
      // Override with error response
      client._fetchFn = async () => {
        return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
      }

      const result = await client.getAIConfig()
      assert.equal(result.success, false)
      assert.ok(result.error.includes('500'))
    })
  })

  describe('syncAIConfig', () => {
    it('syncs config to DocMind', async () => {
      let receivedBody = null
      const fetchFn = async (url, options) => {
        const path = new URL(url).pathname
        if (path === '/api/v1/ai/config') {
          receivedBody = JSON.parse(options.body)
          return new Response(JSON.stringify({ success: true }), { status: 200 })
        }
        return new Response('{}', { status: 404 })
      }
      const client = new DocMindClient({
        serverUrl: 'http://localhost:3000',
        apiKey: 'test-key',
        fetchFn,
      })
      client._connected = true

      const result = await client.syncAIConfig({
        protocol: 'openai',
        model: 'gpt-4o',
        baseUrl: 'https://api.openai.com',
        maxTokens: 4096,
      })

      assert.equal(result.success, true)
      assert.equal(receivedBody.protocol, 'openai')
      assert.equal(receivedBody.model, 'gpt-4o')
      assert.equal(receivedBody.base_url, 'https://api.openai.com')
      assert.equal(receivedBody.max_tokens, 4096)
    })

    it('returns error for null config', async () => {
      const client = createConnectedClient({})
      const result = await client.syncAIConfig(null)
      assert.equal(result.success, false)
      assert.ok(result.error)
    })

    it('throws when not connected', async () => {
      const client = new DocMindClient({ fetchFn: async () => ({}) })
      client._connected = false

      await assert.rejects(
        () => client.syncAIConfig({ model: 'gpt-4o' }),
        (err) => {
          assert.ok(err.message.includes('未连接'))
          return true
        }
      )
    })
  })

  describe('getAvailableModels', () => {
    it('fetches available models from DocMind', async () => {
      const client = createConnectedClient({
        '/api/v1/ai/models': () => ({
          models: [
            { id: 'gpt-4o', name: 'GPT-4o', family: 'openai', available: true },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', family: 'openai', available: true },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet', family: 'claude', available: false },
          ],
        }),
      })

      const result = await client.getAvailableModels()
      assert.equal(result.success, true)
      assert.equal(result.models.length, 3)
      assert.equal(result.models[0].id, 'gpt-4o')
      assert.equal(result.models[0].name, 'GPT-4o')
      assert.equal(result.models[0].family, 'openai')
      assert.equal(result.models[0].available, true)
      assert.equal(result.models[2].available, false)
    })

    it('handles empty models list', async () => {
      const client = createConnectedClient({
        '/api/v1/ai/models': () => ({}),
      })

      const result = await client.getAvailableModels()
      assert.equal(result.success, true)
      assert.deepEqual(result.models, [])
    })

    it('throws when not connected', async () => {
      const client = new DocMindClient({ fetchFn: async () => ({}) })
      client._connected = false

      await assert.rejects(
        () => client.getAvailableModels(),
        (err) => {
          assert.ok(err.message.includes('未连接'))
          return true
        }
      )
    })
  })

  describe('getAIUsage', () => {
    it('fetches usage stats from DocMind', async () => {
      const client = createConnectedClient({
        '/api/v1/ai/usage': () => ({
          total_tokens: 50000,
          input_tokens: 30000,
          output_tokens: 20000,
          total_cost_usd: 1.25,
          request_count: 42,
          model_breakdown: {
            'gpt-4o': { requests: 30, tokens: 35000 },
            'claude-sonnet-4-6': { requests: 12, tokens: 15000 },
          },
        }),
      })

      const result = await client.getAIUsage()
      assert.equal(result.success, true)
      assert.equal(result.usage.totalTokens, 50000)
      assert.equal(result.usage.inputTokens, 30000)
      assert.equal(result.usage.outputTokens, 20000)
      assert.equal(result.usage.totalCostUsd, 1.25)
      assert.equal(result.usage.requestCount, 42)
      assert.equal(result.usage.modelBreakdown['gpt-4o'].requests, 30)
    })

    it('handles camelCase response format', async () => {
      const client = createConnectedClient({
        '/api/v1/ai/usage': () => ({
          totalTokens: 10000,
          inputTokens: 6000,
          outputTokens: 4000,
          totalCostUsd: 0.50,
          requestCount: 10,
          modelBreakdown: {},
        }),
      })

      const result = await client.getAIUsage()
      assert.equal(result.success, true)
      assert.equal(result.usage.totalTokens, 10000)
      assert.equal(result.usage.requestCount, 10)
    })

    it('passes query params for time range', async () => {
      let capturedUrl = null
      const fetchFn = async (url) => {
        capturedUrl = url
        return new Response(JSON.stringify({ total_tokens: 0 }), { status: 200 })
      }
      const client = new DocMindClient({
        serverUrl: 'http://localhost:3000',
        apiKey: 'test-key',
        fetchFn,
      })
      client._connected = true

      await client.getAIUsage({ since: '2026-05-01T00:00:00Z', until: '2026-05-13T00:00:00Z' })

      assert.ok(capturedUrl.includes('since='))
      assert.ok(capturedUrl.includes('until='))
    })

    it('throws when not connected', async () => {
      const client = new DocMindClient({ fetchFn: async () => ({}) })
      client._connected = false

      await assert.rejects(
        () => client.getAIUsage(),
        (err) => {
          assert.ok(err.message.includes('未连接'))
          return true
        }
      )
    })
  })
})

// ==================== AIGateway ====================

describe('AIGateway', () => {
  let gateway
  let storage

  beforeEach(() => {
    storage = createMockStorage()
    const client = createConnectedClient({
      '/api/v1/ai/config': () => ({
        provider: 'openai',
        model: 'gpt-4o',
        protocol: 'openai',
        base_url: 'https://api.openai.com',
        max_tokens: 4096,
        models: ['gpt-4o', 'gpt-4o-mini'],
      }),
      '/api/v1/ai/models': () => ({
        models: [
          { id: 'gpt-4o', name: 'GPT-4o', family: 'openai', available: true },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', family: 'openai', available: true },
        ],
      }),
      '/api/v1/ai/usage': () => ({
        total_tokens: 25000,
        input_tokens: 15000,
        output_tokens: 10000,
        total_cost_usd: 0.80,
        request_count: 20,
        model_breakdown: {},
      }),
    })

    gateway = new AIGateway({
      client,
      storageGet: storage.get,
      storageSet: storage.set,
    })
  })

  // ---- Configuration ----

  describe('loadConfig', () => {
    it('loads default config when no stored config exists', async () => {
      const config = await gateway.loadConfig()
      assert.equal(config.enabled, false)
      assert.equal(config.lastSyncAt, null)
      assert.equal(config.autoSync, false)
      assert.equal(config.conflictPolicy, 'prompt')
    })

    it('loads stored config', async () => {
      storage._store.pagewiseAiGateway = {
        enabled: true,
        lastSyncAt: '2026-05-10T10:00:00Z',
        autoSync: true,
        conflictPolicy: 'overwrite',
      }

      const config = await gateway.loadConfig()
      assert.equal(config.enabled, true)
      assert.equal(config.lastSyncAt, '2026-05-10T10:00:00Z')
      assert.equal(config.autoSync, true)
      assert.equal(config.conflictPolicy, 'overwrite')
    })
  })

  describe('saveConfig', () => {
    it('saves config to storage', async () => {
      await gateway.saveConfig({ enabled: true, autoSync: true })

      assert.equal(storage._store.pagewiseAiGateway.enabled, true)
      assert.equal(storage._store.pagewiseAiGateway.autoSync, true)
    })

    it('merges with existing config', async () => {
      await gateway.saveConfig({ enabled: true })
      await gateway.saveConfig({ autoSync: true })

      const stored = storage._store.pagewiseAiGateway
      assert.equal(stored.enabled, true)
      assert.equal(stored.autoSync, true)
    })
  })

  describe('getStatus', () => {
    it('returns current status', async () => {
      await gateway.loadConfig()
      const status = gateway.getStatus()

      assert.equal(typeof status.enabled, 'boolean')
      assert.equal(typeof status.autoSync, 'boolean')
      assert.equal(typeof status.conflictPolicy, 'string')
      assert.equal(status.hasRemoteConfig, false)
      assert.equal(status.hasConflict, false)
    })
  })

  // ---- Remote Config Fetch ----

  describe('fetchRemoteConfig', () => {
    it('fetches remote config successfully', async () => {
      const result = await gateway.fetchRemoteConfig()
      assert.equal(result.success, true)
      assert.ok(result.config)
      assert.equal(result.config.model, 'gpt-4o')
      assert.equal(result.config.protocol, 'openai')
    })

    it('returns error when client is null', async () => {
      const gw = new AIGateway({ storageGet: storage.get, storageSet: storage.set })
      const result = await gw.fetchRemoteConfig()
      assert.equal(result.success, false)
      assert.ok(result.error.includes('未初始化'))
    })

    it('detects conflict when local settings differ', async () => {
      const localSettings = {
        apiProtocol: 'claude',
        model: 'claude-sonnet-4-6',
        apiBaseUrl: 'https://api.anthropic.com',
        maxTokens: 8192,
      }

      const result = await gateway.fetchRemoteConfig(localSettings)
      assert.equal(result.success, true)
      assert.ok(result.conflict)
      assert.ok(result.conflict.differences.length > 0)
    })

    it('no conflict when settings match', async () => {
      const localSettings = {
        apiProtocol: 'openai',
        model: 'gpt-4o',
        apiBaseUrl: 'https://api.openai.com',
        maxTokens: 4096,
      }

      const result = await gateway.fetchRemoteConfig(localSettings)
      assert.equal(result.success, true)
      assert.equal(result.conflict, undefined)
    })

    it('no conflict when only some fields differ but no overlap', async () => {
      // Remote has model, local has same model — no conflict
      const localSettings = {
        apiProtocol: 'openai',
        model: 'gpt-4o',
        apiBaseUrl: 'https://api.openai.com',
        maxTokens: 4096,
      }

      const result = await gateway.fetchRemoteConfig(localSettings)
      assert.equal(result.success, true)
      assert.equal(result.conflict, undefined)
    })
  })

  // ---- Apply Remote Config ----

  describe('applyRemoteConfig', () => {
    it('applies remote config when no conflict', async () => {
      // First fetch to populate remote config
      await gateway.fetchRemoteConfig()

      const result = await gateway.applyRemoteConfig({ skipConflictCheck: true })
      assert.equal(result.success, true)
      assert.ok(result.settings)
      assert.equal(result.settings.apiProtocol, 'openai')
      assert.equal(result.settings.model, 'gpt-4o')
    })

    it('auto-fetches remote config if not already fetched', async () => {
      const result = await gateway.applyRemoteConfig({ skipConflictCheck: true })
      assert.equal(result.success, true)
      assert.ok(result.settings)
    })

    it('blocks on conflict with prompt policy', async () => {
      const localSettings = {
        apiProtocol: 'claude',
        model: 'claude-sonnet-4-6',
        apiBaseUrl: 'https://api.anthropic.com',
        maxTokens: 8192,
      }

      await gateway.fetchRemoteConfig(localSettings)

      const result = await gateway.applyRemoteConfig()
      assert.equal(result.success, false)
      assert.ok(result.conflict)
      assert.ok(result.error.includes('冲突'))
    })

    it('skips on conflict with keep-local policy', async () => {
      await gateway.saveConfig({ conflictPolicy: 'keep-local' })

      const localSettings = {
        apiProtocol: 'claude',
        model: 'claude-sonnet-4-6',
        apiBaseUrl: 'https://api.anthropic.com',
        maxTokens: 8192,
      }

      await gateway.fetchRemoteConfig(localSettings)

      const result = await gateway.applyRemoteConfig()
      assert.equal(result.success, true)
      assert.equal(result.skipped, true)
    })

    it('overwrites on conflict with overwrite policy', async () => {
      await gateway.saveConfig({ conflictPolicy: 'overwrite' })

      const localSettings = {
        apiProtocol: 'claude',
        model: 'claude-sonnet-4-6',
        apiBaseUrl: 'https://api.anthropic.com',
        maxTokens: 8192,
      }

      await gateway.fetchRemoteConfig(localSettings)

      const result = await gateway.applyRemoteConfig()
      assert.equal(result.success, true)
      assert.ok(result.settings)
      assert.equal(result.settings.apiProtocol, 'openai')
    })

    it('updates lastSyncAt after applying', async () => {
      await gateway.fetchRemoteConfig()
      await gateway.applyRemoteConfig({ skipConflictCheck: true })

      assert.ok(gateway.getStatus().lastSyncAt)
    })
  })

  // ---- Force Sync ----

  describe('forceSyncConfig', () => {
    it('always applies regardless of conflicts', async () => {
      const localSettings = {
        apiProtocol: 'claude',
        model: 'claude-sonnet-4-6',
        apiBaseUrl: 'https://api.anthropic.com',
        maxTokens: 8192,
      }

      await gateway.fetchRemoteConfig(localSettings)
      const result = await gateway.forceSyncConfig()
      assert.equal(result.success, true)
      assert.ok(result.settings)
    })
  })

  // ---- Keep Local ----

  describe('keepLocalConfig', () => {
    it('clears conflict and updates sync time', async () => {
      const localSettings = {
        apiProtocol: 'claude',
        model: 'claude-sonnet-4-6',
        apiBaseUrl: 'https://api.anthropic.com',
        maxTokens: 8192,
      }

      await gateway.fetchRemoteConfig(localSettings)
      assert.ok(gateway.getLastConflict())

      await gateway.keepLocalConfig()
      assert.equal(gateway.getLastConflict(), null)
      assert.ok(gateway.getStatus().lastSyncAt)
    })
  })

  // ---- Get Available Models ----

  describe('getAvailableModels', () => {
    it('fetches models from DocMind', async () => {
      const result = await gateway.getAvailableModels()
      assert.equal(result.success, true)
      assert.ok(Array.isArray(result.models))
      assert.ok(result.models.length > 0)
    })

    it('returns error when client is null', async () => {
      const gw = new AIGateway({ storageGet: storage.get, storageSet: storage.set })
      const result = await gw.getAvailableModels()
      assert.equal(result.success, false)
      assert.deepEqual(result.models, [])
    })
  })

  // ---- Get Usage Stats ----

  describe('getUsageStats', () => {
    it('fetches usage from DocMind', async () => {
      const result = await gateway.getUsageStats()
      assert.equal(result.success, true)
      assert.ok(result.usage)
      assert.equal(result.usage.totalTokens, 25000)
      assert.equal(result.usage.requestCount, 20)
    })

    it('returns error when client is null', async () => {
      const gw = new AIGateway({ storageGet: storage.get, storageSet: storage.set })
      const result = await gw.getUsageStats()
      assert.equal(result.success, false)
      assert.ok(result.error)
    })

    it('passes time range options', async () => {
      const result = await gateway.getUsageStats({
        since: '2026-05-01T00:00:00Z',
      })
      assert.equal(result.success, true)
    })
  })

  // ---- Conflict Detection ----

  describe('conflict detection', () => {
    it('detects protocol difference', async () => {
      const localSettings = {
        apiProtocol: 'claude',
        model: 'gpt-4o',
        apiBaseUrl: 'https://api.openai.com',
        maxTokens: 4096,
      }

      await gateway.fetchRemoteConfig(localSettings)
      const conflict = gateway.getLastConflict()
      assert.ok(conflict)
      assert.ok(conflict.differences.some(d => d.field === 'protocol'))
    })

    it('detects model difference', async () => {
      const localSettings = {
        apiProtocol: 'openai',
        model: 'gpt-4o-mini',
        apiBaseUrl: 'https://api.openai.com',
        maxTokens: 4096,
      }

      await gateway.fetchRemoteConfig(localSettings)
      const conflict = gateway.getLastConflict()
      assert.ok(conflict)
      assert.ok(conflict.differences.some(d => d.field === 'model'))
    })

    it('detects baseUrl difference', async () => {
      const localSettings = {
        apiProtocol: 'openai',
        model: 'gpt-4o',
        apiBaseUrl: 'https://my-proxy.example.com',
        maxTokens: 4096,
      }

      await gateway.fetchRemoteConfig(localSettings)
      const conflict = gateway.getLastConflict()
      assert.ok(conflict)
      assert.ok(conflict.differences.some(d => d.field === 'baseUrl'))
    })

    it('detects maxTokens difference', async () => {
      const localSettings = {
        apiProtocol: 'openai',
        model: 'gpt-4o',
        apiBaseUrl: 'https://api.openai.com',
        maxTokens: 8192,
      }

      await gateway.fetchRemoteConfig(localSettings)
      const conflict = gateway.getLastConflict()
      assert.ok(conflict)
      assert.ok(conflict.differences.some(d => d.field === 'maxTokens'))
    })

    it('detects multiple differences', async () => {
      const localSettings = {
        apiProtocol: 'claude',
        model: 'claude-sonnet-4-6',
        apiBaseUrl: 'https://api.anthropic.com',
        maxTokens: 8192,
      }

      await gateway.fetchRemoteConfig(localSettings)
      const conflict = gateway.getLastConflict()
      assert.ok(conflict)
      assert.ok(conflict.differences.length >= 3)
    })

    it('includes local and remote summaries in conflict', async () => {
      const localSettings = {
        apiProtocol: 'claude',
        model: 'claude-sonnet-4-6',
        apiBaseUrl: 'https://api.anthropic.com',
        maxTokens: 8192,
      }

      await gateway.fetchRemoteConfig(localSettings)
      const conflict = gateway.getLastConflict()
      assert.ok(conflict.local)
      assert.ok(conflict.remote)
      assert.equal(conflict.local.protocol, 'claude')
      assert.equal(conflict.remote.protocol, 'openai')
    })
  })

  // ---- Config Summary ----

  describe('getConfigSummary', () => {
    it('returns summary without sensitive data', async () => {
      await gateway.loadConfig()
      const summary = gateway.getConfigSummary()
      assert.equal(typeof summary.enabled, 'boolean')
      assert.equal(typeof summary.autoSync, 'boolean')
      assert.equal(typeof summary.conflictPolicy, 'string')
      assert.ok(!('apiKey' in summary))
      assert.ok(!('serverUrl' in summary))
    })
  })

  // ---- Callback ----

  describe('onConfigSynced callback', () => {
    it('fires when config is applied', async () => {
      let callbackSettings = null
      const gw = new AIGateway({
        client: gateway._client,
        storageGet: storage.get,
        storageSet: storage.set,
        onConfigSynced: (settings) => { callbackSettings = settings },
      })

      await gw.fetchRemoteConfig()
      await gw.forceSyncConfig()

      assert.ok(callbackSettings)
      assert.equal(callbackSettings.apiProtocol, 'openai')
    })
  })

  // ---- Destroy ----

  describe('destroy', () => {
    it('clears remote config and conflict', async () => {
      await gateway.fetchRemoteConfig()
      assert.ok(gateway.getRemoteConfig())

      gateway.destroy()
      assert.equal(gateway.getRemoteConfig(), null)
      assert.equal(gateway.getLastConflict(), null)
    })
  })
})
