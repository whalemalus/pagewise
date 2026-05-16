/**
 * Storage Adapter — chrome.storage.sync 自动降级模块
 *
 * 在支持 sync 的环境中使用 chrome.storage.sync（跨设备同步），
 * 在 sync 不可用时自动降级到 chrome.storage.local（PinchTab / 无登录 Chromium 等）。
 *
 * 使用方法:
 *   import { storageGet, storageSet, isSyncStorage } from './lib/storage-adapter.js';
 *   const result = await storageGet({ apiKey: '' });
 *   await storageSet({ apiKey: 'sk-xxx' });
 *
 * @module storage-adapter
 */

/**
 * @type {'sync'|'local'|null} 缓存的存储后端类型，null 表示尚未检测
 * @private
 */
let _backend = null

/**
 * @type {Promise<boolean>|null} 正在进行的检测 Promise，避免并发重复检测
 * @private
 */
let _detecting = null

/**
 * 检测 chrome.storage.sync 是否可用
 *
 * 检测逻辑：
 * 1. chrome.storage.sync 必须存在
 * 2. 尝试执行一次 get 操作
 * 3. 如果操作成功（无 lastError），sync 可用
 * 4. 如果操作失败，降级到 local
 *
 * @returns {Promise<boolean>}
 */
export async function detectSyncAvailable() {
  if (_backend !== null) return _backend === 'sync'

  // 避免并发检测
  if (_detecting) return _detecting

  _detecting = _doDetect()
  const result = await _detecting
  _detecting = null
  return result
}

/**
 * 实际执行检测（内部）
 * @returns {Promise<boolean>}
 * @private
 */
async function _doDetect() {
  // 步骤 1: 检查 chrome 对象是否可用
  if (typeof chrome === 'undefined' || !chrome.storage) {
    _backend = 'local'
    return false
  }

  // 步骤 2: 检查 chrome.storage.sync 是否存在
  if (!chrome.storage.sync || typeof chrome.storage.sync.get !== 'function') {
    _backend = 'local'
    return false
  }

  // 步骤 3: 尝试一次实际读取来验证 sync 功能
  try {
    const ok = await new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ __pw_sync_test: null }, (result) => {
          // 检查 runtime.lastError
          const err = chrome.runtime?.lastError
          if (err) {
            resolve(false)
          } else {
            resolve(true)
          }
        })
      } catch (e) {
        // chrome.storage.sync.get 本身抛出异常
        resolve(false)
      }
    })

    _backend = ok ? 'sync' : 'local'
    return ok
  } catch (e) {
    _backend = 'local'
    return false
  }
}

/**
 * 获取底层存储对象
 * @returns {object} chrome.storage.sync 或 chrome.storage.local
 * @private
 */
function _getStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    if (_backend === 'sync' && chrome.storage.sync) {
      return chrome.storage.sync
    }
    // local 是安全的 fallback
    if (chrome.storage.local) {
      return chrome.storage.local
    }
  }
  // 终极 fallback: 返回空壳（测试环境 / Node.js 等）
  return {
    get: (keys, cb) => {
      // 当 keys 是默认值对象时，返回默认值
      const result = (keys && typeof keys === 'object' && !Array.isArray(keys))
        ? { ...keys }
        : {}
      if (cb) cb(result)
    },
    set: (items, cb) => cb && cb(),
    remove: (keys, cb) => cb && cb(),
  }
}

/**
 * 读取存储值
 *
 * 用法与 chrome.storage.sync.get 一致：
 *   const result = await storageGet({ apiKey: '', model: 'gpt-4o' });
 *   console.log(result.apiKey);
 *
 * @param {Object|string|string[]} keys - 默认值对象 / key / key 数组
 * @returns {Promise<Object>}
 */
export async function storageGet(keys) {
  // 确保后端已检测
  if (_backend === null) {
    await detectSyncAvailable()
  }

  const storage = _getStorage()

  return new Promise((resolve) => {
    try {
      storage.get(keys, (result) => {
        const err = typeof chrome !== 'undefined' && chrome.runtime?.lastError
        if (err) {
          // get 失败，降级到 local（如果当前是 sync 的话）
          if (_backend === 'sync' && chrome.storage?.local) {
            _backend = 'local'
            chrome.storage.local.get(keys, (localResult) => {
              resolve(localResult || {})
            })
            return
          }
          resolve(typeof keys === 'object' && !Array.isArray(keys) ? keys : {})
        } else {
          resolve(result || {})
        }
      })
    } catch (e) {
      // 同步异常，返回默认值
      resolve(typeof keys === 'object' && !Array.isArray(keys) ? { ...keys } : {})
    }
  })
}

/**
 * 写入存储值
 *
 * 用法与 chrome.storage.sync.set 一致：
 *   await storageSet({ apiKey: 'sk-xxx', model: 'gpt-4o' });
 *
 * @param {Object} items - 要存储的键值对
 * @returns {Promise<void>}
 */
export async function storageSet(items) {
  if (_backend === null) {
    await detectSyncAvailable()
  }

  const storage = _getStorage()

  return new Promise((resolve) => {
    try {
      storage.set(items, () => {
        const err = typeof chrome !== 'undefined' && chrome.runtime?.lastError
        if (err) {
          // set 失败，降级到 local
          if (_backend === 'sync' && chrome.storage?.local) {
            _backend = 'local'
            chrome.storage.local.set(items, () => resolve())
            return
          }
        }
        resolve()
      })
    } catch (e) {
      resolve()
    }
  })
}

/**
 * 删除存储值
 *
 * @param {string|string[]} keys
 * @returns {Promise<void>}
 */
export async function storageRemove(keys) {
  if (_backend === null) {
    await detectSyncAvailable()
  }

  const storage = _getStorage()

  return new Promise((resolve) => {
    try {
      storage.remove(keys, () => {
        const err = typeof chrome !== 'undefined' && chrome.runtime?.lastError
        if (err && _backend === 'sync' && chrome.storage?.local) {
          _backend = 'local'
          chrome.storage.local.remove(keys, () => resolve())
          return
        }
        resolve()
      })
    } catch (e) {
      resolve()
    }
  })
}

/**
 * 当前是否使用 sync 存储
 * @returns {boolean}
 */
export function isSyncStorage() {
  return _backend === 'sync'
}

/**
 * 获取当前后端类型
 * @returns {'sync'|'local'|'unknown'}
 */
export function getStorageBackend() {
  if (_backend === null) return 'unknown'
  return _backend
}

/**
 * 重置检测状态（测试用）
 */
export function resetStorageAdapter() {
  _backend = null
  _detecting = null
}
