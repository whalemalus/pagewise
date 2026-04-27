/**
 * 测试环境初始化
 *
 * 提供 setupTestEnv() 用于每个测试文件。
 */

import { installChromeMock, resetChromeMock, uninstallChromeMock } from './chrome-mock.js';
import { installIndexedDBMock, resetIndexedDBMock, uninstallIndexedDBMock } from './indexeddb-mock.js';

/**
 * 初始化测试环境（Chrome mock）
 * @returns {{ cleanup: () => void }}
 */
export function setupTestEnv() {
  const chrome = installChromeMock();
  return {
    chrome,
    cleanup: () => {
      resetChromeMock();
    },
  };
}

/**
 * 初始化含 IndexedDB mock 的测试环境
 * @returns {{ cleanup: () => void }}
 */
export function setupTestEnvWithIDB() {
  const chrome = installChromeMock();
  const idb = installIndexedDBMock();
  return {
    chrome,
    idb,
    cleanup: () => {
      resetChromeMock();
      resetIndexedDBMock();
    },
  };
}

export {
  installChromeMock,
  resetChromeMock,
  uninstallChromeMock,
  installIndexedDBMock,
  resetIndexedDBMock,
  uninstallIndexedDBMock,
};
