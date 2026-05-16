/**
 * Test — storage-adapter.js
 *
 * Tests the storage adapter's sync→local fallback mechanism.
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectSyncAvailable,
  storageGet,
  storageSet,
  storageRemove,
  isSyncStorage,
  getStorageBackend,
  resetStorageAdapter,
} from '../lib/storage-adapter.js'

// ==================== helpers ====================

function installChromeWithSync() {
  const syncStore = {}
  const localStore = {}

  function makeStore(store) {
    return {
      get(keys, cb) {
        const result = {}
        if (keys === null || keys === undefined) {
          Object.assign(result, store)
        } else if (typeof keys === 'string') {
          if (store[keys] !== undefined) result[keys] = store[keys]
        } else if (Array.isArray(keys)) {
          for (const k of keys) {
            if (store[k] !== undefined) result[k] = store[k]
          }
        } else if (typeof keys === 'object') {
          for (const [k, def] of Object.entries(keys)) {
            result[k] = store[k] !== undefined ? store[k] : def
          }
        }
        if (cb) cb(result)
      },
      set(items, cb) {
        Object.assign(store, items)
        if (cb) cb()
      },
      remove(keys, cb) {
        const arr = Array.isArray(keys) ? keys : [keys]
        for (const k of arr) delete store[k]
        if (cb) cb()
      },
    }
  }

  globalThis.chrome = {
    storage: {
      sync: makeStore(syncStore),
      local: makeStore(localStore),
      _syncStore: syncStore,
      _localStore: localStore,
    },
    runtime: { lastError: null },
  }
  return { syncStore, localStore }
}

function installChromeWithoutSync() {
  const localStore = {}

  function makeStore(store) {
    return {
      get(keys, cb) {
        const result = {}
        if (keys === null || keys === undefined) {
          Object.assign(result, store)
        } else if (typeof keys === 'object') {
          for (const [k, def] of Object.entries(keys)) {
            result[k] = store[k] !== undefined ? store[k] : def
          }
        }
        if (cb) cb(result)
      },
      set(items, cb) {
        Object.assign(store, items)
        if (cb) cb()
      },
      remove(keys, cb) {
        const arr = Array.isArray(keys) ? keys : [keys]
        for (const k of arr) delete store[k]
        if (cb) cb()
      },
    }
  }

  globalThis.chrome = {
    storage: {
      local: makeStore(localStore),
      _localStore: localStore,
      // no sync!
    },
    runtime: { lastError: null },
  }
  return { localStore }
}

function installChromeWithBrokenSync() {
  const localStore = {}

  function makeStore(store) {
    return {
      get(keys, cb) {
        const result = {}
        if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
          for (const [k, def] of Object.entries(keys)) {
            result[k] = store[k] !== undefined ? store[k] : def
          }
        }
        if (cb) cb(result)
      },
      set(items, cb) {
        Object.assign(store, items)
        if (cb) cb()
      },
      remove(keys, cb) {
        const arr = Array.isArray(keys) ? keys : [keys]
        for (const k of arr) delete store[k]
        if (cb) cb()
      },
    }
  }

  const brokenSync = {
    get(keys, cb) {
      // Simulate broken sync — sets lastError
      globalThis.chrome.runtime.lastError = { message: 'Sync is not available' }
      if (cb) cb({})
      globalThis.chrome.runtime.lastError = null
    },
    set(items, cb) {
      globalThis.chrome.runtime.lastError = { message: 'Sync is not available' }
      if (cb) cb()
      globalThis.chrome.runtime.lastError = null
    },
  }

  globalThis.chrome = {
    storage: {
      sync: brokenSync,
      local: makeStore(localStore),
      _localStore: localStore,
    },
    runtime: { lastError: null },
  }
  return { localStore }
}

function removeChrome() {
  delete globalThis.chrome
}

// ==================== tests ====================

describe('storage-adapter', () => {
  afterEach(() => {
    removeChrome()
    resetStorageAdapter()
  })

  describe('detectSyncAvailable()', () => {
    it('should return true when chrome.storage.sync works', async () => {
      installChromeWithSync()
      const available = await detectSyncAvailable()
      assert.equal(available, true)
    })

    it('should return false when chrome is undefined', async () => {
      removeChrome()
      const available = await detectSyncAvailable()
      assert.equal(available, false)
    })

    it('should return false when chrome.storage.sync is missing', async () => {
      installChromeWithoutSync()
      const available = await detectSyncAvailable()
      assert.equal(available, false)
    })

    it('should return false when chrome.storage.sync is broken (lastError)', async () => {
      installChromeWithBrokenSync()
      const available = await detectSyncAvailable()
      assert.equal(available, false)
    })

    it('should cache the result', async () => {
      installChromeWithSync()
      const first = await detectSyncAvailable()
      const second = await detectSyncAvailable()
      assert.equal(first, second)
    })
  })

  describe('storageGet()', () => {
    it('should read from sync when available', async () => {
      const { syncStore } = installChromeWithSync()
      syncStore.apiKey = 'test-key'

      const result = await storageGet({ apiKey: '' })
      assert.equal(result.apiKey, 'test-key')
    })

    it('should return defaults when key is missing', async () => {
      installChromeWithSync()

      const result = await storageGet({ apiKey: '', model: 'gpt-4o' })
      assert.equal(result.apiKey, '')
      assert.equal(result.model, 'gpt-4o')
    })

    it('should read from local when sync is unavailable', async () => {
      const { localStore } = installChromeWithoutSync()
      localStore.apiKey = 'local-key'

      const result = await storageGet({ apiKey: '' })
      assert.equal(result.apiKey, 'local-key')
    })

    it('should return defaults when chrome is undefined', async () => {
      removeChrome()
      resetStorageAdapter()

      const result = await storageGet({ apiKey: '', model: 'gpt-4o' })
      assert.equal(result.apiKey, '')
      assert.equal(result.model, 'gpt-4o')
    })

    it('should handle null keys (get all)', async () => {
      const { syncStore } = installChromeWithSync()
      syncStore.foo = 'bar'
      syncStore.baz = 42

      const result = await storageGet(null)
      assert.equal(result.foo, 'bar')
      assert.equal(result.baz, 42)
    })
  })

  describe('storageSet()', () => {
    it('should write to sync when available', async () => {
      const { syncStore } = installChromeWithSync()
      await storageSet({ apiKey: 'new-key' })
      assert.equal(syncStore.apiKey, 'new-key')
    })

    it('should write to local when sync is unavailable', async () => {
      const { localStore } = installChromeWithoutSync()
      await storageSet({ apiKey: 'local-key' })
      assert.equal(localStore.apiKey, 'local-key')
    })

    it('should not throw when chrome is undefined', async () => {
      removeChrome()
      resetStorageAdapter()
      await storageSet({ apiKey: 'test' }) // should not throw
    })
  })

  describe('storageRemove()', () => {
    it('should remove from sync when available', async () => {
      const { syncStore } = installChromeWithSync()
      syncStore.apiKey = 'to-delete'
      await storageRemove('apiKey')
      assert.equal(syncStore.apiKey, undefined)
    })

    it('should remove from local when sync is unavailable', async () => {
      const { localStore } = installChromeWithoutSync()
      localStore.apiKey = 'to-delete'
      await storageRemove('apiKey')
      assert.equal(localStore.apiKey, undefined)
    })
  })

  describe('isSyncStorage() / getStorageBackend()', () => {
    it('should report sync when sync is available', async () => {
      installChromeWithSync()
      await detectSyncAvailable()
      assert.equal(isSyncStorage(), true)
      assert.equal(getStorageBackend(), 'sync')
    })

    it('should report local when sync is unavailable', async () => {
      installChromeWithoutSync()
      await detectSyncAvailable()
      assert.equal(isSyncStorage(), false)
      assert.equal(getStorageBackend(), 'local')
    })

    it('should report unknown before detection', () => {
      assert.equal(getStorageBackend(), 'unknown')
    })
  })

  describe('broken sync fallback', () => {
    it('should fall back to local when sync.get sets lastError', async () => {
      const { localStore } = installChromeWithBrokenSync()
      localStore.apiKey = 'from-local'

      const result = await storageGet({ apiKey: '' })
      assert.equal(result.apiKey, 'from-local')
    })
  })

  describe('integration with utils.js getSettings', () => {
    it('should work through getSettings when sync is unavailable', async () => {
      const { localStore } = installChromeWithoutSync()
      localStore.apiKey = 'test-key'
      localStore.model = 'claude-sonnet-4-6'

      // Dynamically import to pick up our chrome mock
      const { getSettings } = await import('../lib/utils.js')
      const settings = await getSettings()
      assert.equal(settings.apiKey, 'test-key')
      assert.equal(settings.model, 'claude-sonnet-4-6')
    })
  })

  describe('integration with utils.js saveSettings', () => {
    it('should save through saveSettings when sync is unavailable', async () => {
      const { localStore } = installChromeWithoutSync()

      const { saveSettings } = await import('../lib/utils.js')
      await saveSettings({ apiKey: 'saved-key', model: 'gpt-4o' })
      assert.equal(localStore.apiKey, 'saved-key')
      assert.equal(localStore.model, 'gpt-4o')
    })
  })
})
